from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1.admin.deps import EntityId, UserAdminDep
from app.schemas.admin.users import AdminUserRead, UserListParams, UserUpdate
from app.schemas.common import Page

router = APIRouter(prefix="/users")


@router.get("")
async def list_users(
    params: Annotated[UserListParams, Query()], users: UserAdminDep
) -> Page[AdminUserRead]:
    return await users.search(params)


@router.get("/{user_id}")
async def get_user(user_id: EntityId, users: UserAdminDep) -> AdminUserRead:
    return await users.detail(user_id)


@router.patch("/{user_id}")
async def update_user(user_id: EntityId, body: UserUpdate, users: UserAdminDep) -> AdminUserRead:
    return await users.update(user_id, body)
