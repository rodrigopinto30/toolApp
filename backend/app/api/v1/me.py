from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status

from app.api.v1.cookies import set_session_cookies
from app.api.v1.deps import CurrentUser, user_rate_limit
from app.core.container import AccountServiceDep, AuthServiceDep, SettingsDep
from app.schemas.account import (
    AddressCreate,
    AddressRead,
    AddressUpdate,
    BillingProfileCreate,
    BillingProfileRead,
    BillingProfileUpdate,
    MeRead,
    MeUpdate,
    PasswordChange,
)

router = APIRouter(prefix="/me", tags=["account"])

EntityId = Annotated[int, Path(gt=0)]


@router.get("")
async def get_me(user: CurrentUser) -> MeRead:
    return MeRead.from_user(user)


@router.patch("")
async def update_me(body: MeUpdate, user: CurrentUser, account: AccountServiceDep) -> MeRead:
    return MeRead.from_user(await account.update_profile(user.id, body))


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(user_rate_limit("change-password", limit=5, window=900))],
)
async def change_password(
    body: PasswordChange,
    user: CurrentUser,
    response: Response,
    account: AccountServiceDep,
    auth: AuthServiceDep,
    settings: SettingsDep,
) -> None:
    updated, session = await account.change_password(user.id, body)
    set_session_cookies(response, settings, auth.session_tokens(updated, session))


@router.get("/addresses")
async def list_addresses(user: CurrentUser, account: AccountServiceDep) -> list[AddressRead]:
    return [AddressRead.model_validate(a) for a in await account.addresses(user.id)]


@router.post("/addresses", status_code=status.HTTP_201_CREATED)
async def create_address(
    body: AddressCreate, user: CurrentUser, account: AccountServiceDep
) -> AddressRead:
    return AddressRead.model_validate(await account.create_address(user.id, body))


@router.get("/addresses/{address_id}")
async def get_address(
    address_id: EntityId, user: CurrentUser, account: AccountServiceDep
) -> AddressRead:
    return AddressRead.model_validate(await account.address(user.id, address_id))


@router.patch("/addresses/{address_id}")
async def update_address(
    address_id: EntityId, body: AddressUpdate, user: CurrentUser, account: AccountServiceDep
) -> AddressRead:
    return AddressRead.model_validate(await account.update_address(user.id, address_id, body))


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: EntityId, user: CurrentUser, account: AccountServiceDep
) -> None:
    await account.delete_address(user.id, address_id)


@router.get("/billing-profiles")
async def list_billing_profiles(
    user: CurrentUser, account: AccountServiceDep
) -> list[BillingProfileRead]:
    return [BillingProfileRead.model_validate(p) for p in await account.billing_profiles(user.id)]


@router.post("/billing-profiles", status_code=status.HTTP_201_CREATED)
async def create_billing_profile(
    body: BillingProfileCreate, user: CurrentUser, account: AccountServiceDep
) -> BillingProfileRead:
    return BillingProfileRead.model_validate(await account.create_billing_profile(user.id, body))


@router.get("/billing-profiles/{profile_id}")
async def get_billing_profile(
    profile_id: EntityId, user: CurrentUser, account: AccountServiceDep
) -> BillingProfileRead:
    return BillingProfileRead.model_validate(await account.billing_profile(user.id, profile_id))


@router.patch("/billing-profiles/{profile_id}")
async def update_billing_profile(
    profile_id: EntityId, body: BillingProfileUpdate, user: CurrentUser, account: AccountServiceDep
) -> BillingProfileRead:
    profile = await account.update_billing_profile(user.id, profile_id, body)
    return BillingProfileRead.model_validate(profile)


@router.delete("/billing-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_billing_profile(
    profile_id: EntityId, user: CurrentUser, account: AccountServiceDep
) -> None:
    await account.delete_billing_profile(user.id, profile_id)
