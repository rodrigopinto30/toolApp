from collections.abc import Sequence

from sqlalchemy import func, or_, select, true, update
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import ORMOption

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Address, BillingProfile, User, UserRole


class UserRepository(SqlAlchemyRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        return await self.get_by(email=email)

    async def lock_active_admins(self) -> Sequence[int]:
        statement = (
            select(User.id)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(true()))
            .order_by(User.id)
            .with_for_update()
        )
        return (await self.session.scalars(statement)).all()

    async def search(
        self,
        *,
        q: str | None,
        role: UserRole | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[User], int]:
        exact = ((User.role, role), (User.is_active, is_active))
        conditions = [column == value for column, value in exact if value is not None]
        if q is not None:
            conditions.append(
                or_(
                    User.email.contains(q, autoescape=True),
                    User.first_name.contains(q, autoescape=True),
                    User.last_name.contains(q, autoescape=True),
                )
            )
        total = await self.session.scalar(select(func.count()).select_from(User).where(*conditions))
        statement = (
            select(User).where(*conditions).order_by(User.id.desc()).offset(offset).limit(limit)
        )
        return (await self.session.scalars(statement)).all(), total or 0


class OwnedRepository[ModelT: (Address, BillingProfile)](SqlAlchemyRepository[ModelT]):
    def _options(self) -> Sequence[ORMOption]:
        return ()

    async def list_for(self, user_id: int) -> Sequence[ModelT]:
        statement = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .options(*self._options())
            .order_by(self.model.is_default.desc(), self.model.id.desc())
        )
        return (await self.session.scalars(statement)).all()

    async def get_owned(self, user_id: int, entity_id: int) -> ModelT | None:
        statement = (
            select(self.model)
            .where(self.model.id == entity_id, self.model.user_id == user_id)
            .options(*self._options())
        )
        return await self.session.scalar(statement)

    async def count_for(self, user_id: int) -> int:
        return await self.count(user_id=user_id)

    async def clear_default(self, user_id: int) -> None:
        await self.session.execute(
            update(self.model)
            .where(self.model.user_id == user_id, self.model.is_default.is_(true()))
            .values(is_default=False)
        )

    async def newest_for(self, user_id: int) -> ModelT | None:
        statement = (
            select(self.model)
            .where(self.model.user_id == user_id)
            .order_by(self.model.id.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)


class AddressRepository(OwnedRepository[Address]):
    model = Address

    def _options(self) -> Sequence[ORMOption]:
        return (selectinload(Address.province),)


class BillingProfileRepository(OwnedRepository[BillingProfile]):
    model = BillingProfile
