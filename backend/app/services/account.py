from collections.abc import Sequence

import structlog

from app.auth.sessions import RefreshSession, RefreshSessionStore
from app.core.config import Settings
from app.core.exceptions import BusinessRuleViolation, NotFoundError
from app.core.security import hash_password, verify_password
from app.db.repositories.identity import (
    AddressRepository,
    BillingProfileRepository,
    OwnedRepository,
    UserRepository,
)
from app.db.repositories.pricing import ProvinceRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import Address, BillingProfile, Province, User
from app.schemas.account import (
    AddressCreate,
    AddressUpdate,
    BillingProfileCreate,
    BillingProfileUpdate,
    MeUpdate,
    PasswordChange,
)
from app.schemas.validators import check_tax_identity

logger = structlog.get_logger(__name__)


class AccountService:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        sessions: RefreshSessionStore,
        mailer: Mailer,
        settings: Settings,
    ) -> None:
        self.uow = uow
        self.sessions = sessions
        self.mailer = mailer
        self.settings = settings

    async def update_profile(self, user_id: int, data: MeUpdate) -> User:
        async with self.uow:
            user = await self._user(user_id)
            for field, value in data.changes().items():
                setattr(user, field, value)
        return user

    async def change_password(
        self, user_id: int, data: PasswordChange
    ) -> tuple[User, RefreshSession]:
        async with self.uow:
            user = await self._user(user_id)
            if not verify_password(user.password_hash, data.current_password):
                raise BusinessRuleViolation(
                    "The current password is not correct.", code="invalid_current_password"
                )
            user.password_hash = hash_password(data.new_password)
            await self.sessions.revoke_user(user.id)
            session = await self.sessions.create(user.id)
        logger.info("password_changed", user_id=user.id)
        self.mailer.password_changed(user, data.locale)
        return user, session

    async def _user(self, user_id: int) -> User:
        user = await UserRepository(self.uow.session).get(user_id)
        if user is None:
            raise NotFoundError()
        return user

    async def addresses(self, user_id: int) -> Sequence[Address]:
        async with self.uow:
            return await AddressRepository(self.uow.session).list_for(user_id)

    async def address(self, user_id: int, address_id: int) -> Address:
        async with self.uow:
            return await _owned(AddressRepository(self.uow.session), user_id, address_id)

    async def create_address(self, user_id: int, data: AddressCreate) -> Address:
        async with self.uow:
            repository = AddressRepository(self.uow.session)
            values = data.model_dump(exclude={"province_code", "is_default"})
            address = Address(user_id=user_id, **values)
            address.province = await self._province(data.province_code)
            await _add_owned(
                repository, address, data.is_default, limit=self.settings.max_addresses
            )
        return address

    async def update_address(self, user_id: int, address_id: int, data: AddressUpdate) -> Address:
        async with self.uow:
            repository = AddressRepository(self.uow.session)
            address = await _owned(repository, user_id, address_id)
            changes = data.changes()
            if "province_code" in changes:
                address.province = await self._province(str(changes.pop("province_code")))
            await _update_owned(repository, address, changes)
        return address

    async def delete_address(self, user_id: int, address_id: int) -> None:
        async with self.uow:
            repository = AddressRepository(self.uow.session)
            await _delete_owned(repository, await _owned(repository, user_id, address_id))

    async def _province(self, code: str) -> Province:
        province = await ProvinceRepository(self.uow.session).get_by(code=code)
        if province is None:
            raise BusinessRuleViolation("Unknown province.", code="unknown_province")
        return province

    async def billing_profiles(self, user_id: int) -> Sequence[BillingProfile]:
        async with self.uow:
            return await BillingProfileRepository(self.uow.session).list_for(user_id)

    async def billing_profile(self, user_id: int, profile_id: int) -> BillingProfile:
        async with self.uow:
            return await _owned(BillingProfileRepository(self.uow.session), user_id, profile_id)

    async def create_billing_profile(
        self, user_id: int, data: BillingProfileCreate
    ) -> BillingProfile:
        async with self.uow:
            repository = BillingProfileRepository(self.uow.session)
            profile = BillingProfile(user_id=user_id, **data.model_dump(exclude={"is_default"}))
            await _add_owned(
                repository, profile, data.is_default, limit=self.settings.max_billing_profiles
            )
        return profile

    async def update_billing_profile(
        self, user_id: int, profile_id: int, data: BillingProfileUpdate
    ) -> BillingProfile:
        async with self.uow:
            repository = BillingProfileRepository(self.uow.session)
            profile = await _owned(repository, user_id, profile_id)
            changes = data.changes()
            await _update_owned(repository, profile, changes)
            try:
                check_tax_identity(profile.tax_id_type, profile.tax_id, profile.tax_condition)
            except ValueError as exc:
                raise BusinessRuleViolation(str(exc), code="invalid_tax_id") from exc
        return profile

    async def delete_billing_profile(self, user_id: int, profile_id: int) -> None:
        async with self.uow:
            repository = BillingProfileRepository(self.uow.session)
            await _delete_owned(repository, await _owned(repository, user_id, profile_id))


async def _owned[ModelT: (Address, BillingProfile)](
    repository: OwnedRepository[ModelT], user_id: int, entity_id: int
) -> ModelT:
    entity = await repository.get_owned(user_id, entity_id)
    if entity is None:
        raise NotFoundError()
    return entity


async def _add_owned[ModelT: (Address, BillingProfile)](
    repository: OwnedRepository[ModelT], entity: ModelT, is_default: bool, *, limit: int
) -> None:
    """The first entity becomes the default. The previous default is cleared first: the
    unique index allows only one default per user."""
    count = await repository.count_for(entity.user_id)
    if count >= limit:
        raise BusinessRuleViolation(
            f"You can have at most {limit} of these.",
            code="limit_reached",
            details={"limit": limit},
        )
    if is_default and count:
        await repository.clear_default(entity.user_id)
    entity.is_default = is_default or count == 0
    repository.add(entity)
    await repository.session.flush()


async def _update_owned[ModelT: (Address, BillingProfile)](
    repository: OwnedRepository[ModelT], entity: ModelT, changes: dict[str, object]
) -> None:
    if changes.pop("is_default", None) and not entity.is_default:
        await repository.clear_default(entity.user_id)
        entity.is_default = True
    for field, value in changes.items():
        setattr(entity, field, value)
    await repository.session.flush()


async def _delete_owned[ModelT: (Address, BillingProfile)](
    repository: OwnedRepository[ModelT], entity: ModelT
) -> None:
    was_default = entity.is_default
    await repository.delete(entity)
    await repository.session.flush()
    if was_default:
        replacement = await repository.newest_for(entity.user_id)
        if replacement is not None:
            replacement.is_default = True
            await repository.session.flush()
