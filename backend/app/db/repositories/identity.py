from collections.abc import Sequence

from sqlalchemy import select, true, update
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import ORMOption

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Address, BillingProfile, User


class UserRepository(SqlAlchemyRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        return await self.get_by(email=email)


class OwnedRepository[ModelT: (Address, BillingProfile)](SqlAlchemyRepository[ModelT]):
    """Resources that belong to a user: every query is scoped by user_id, so another
    user's id behaves exactly like a missing one."""

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
