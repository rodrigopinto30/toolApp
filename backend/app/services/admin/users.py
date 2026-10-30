from collections.abc import Mapping
from typing import Any

import structlog

from app.auth.sessions import RefreshSessionStore
from app.core.exceptions import AppError, ConflictError
from app.db.repositories.identity import UserRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import User, UserRole
from app.schemas.admin.users import AdminUserRead, UserListParams, UserUpdate
from app.schemas.common import Page
from app.services.admin.base import AdminResource
from app.services.audit import AuditTrail
from app.services.revalidation import ChangePublisher

logger = structlog.get_logger(__name__)


class UserAdmin(AdminResource[User, AdminUserRead]):
    model = User
    read = AdminUserRead
    entity = "user"
    fields = ("role", "is_active")
    ordering = (User.id.desc(),)

    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        audit: AuditTrail,
        changes: ChangePublisher,
        sessions: RefreshSessionStore,
    ) -> None:
        super().__init__(uow, audit, changes)
        self.sessions = sessions
        self._active_admins = 0

    async def search(self, params: UserListParams) -> Page[AdminUserRead]:
        async with self.uow:
            users, total = await UserRepository(self.uow.session).search(
                q=params.q,
                role=params.role,
                is_active=params.is_active,
                offset=params.offset,
                limit=params.size,
            )
            items = [self._present(user) for user in users]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def update(self, key: int | str, body: UserUpdate) -> AdminUserRead:
        result = await super().update(key, body)
        if body.is_active is False:
            await self._close_sessions(result.id)
        return result

    async def validate(self, state: Mapping[str, Any], entity: User | None) -> None:
        if entity is None or not _loses_admin(entity, state):
            return
        if self._active_admins <= 1:
            raise ConflictError("The last active admin must stay.", code="last_admin")
        if entity.id == self.audit.actor_id:
            raise ConflictError("You cannot deactivate or demote yourself.", code="self_change")

    async def _load(self, key: int | str) -> User:
        admins = await UserRepository(self.uow.session).lock_active_admins()
        self._active_admins = len(admins)
        return await super()._load(key)

    async def _close_sessions(self, user_id: int) -> None:
        try:
            await self.sessions.revoke_user(user_id)
        except AppError as exc:
            logger.warning("user_sessions_not_closed", user_id=user_id, code=exc.code)


def _is_active_admin(role: UserRole, is_active: bool) -> bool:
    return role == UserRole.ADMIN and is_active


def _loses_admin(entity: User, state: Mapping[str, Any]) -> bool:
    return _is_active_admin(entity.role, entity.is_active) and not _is_active_admin(
        state["role"], state["is_active"]
    )
