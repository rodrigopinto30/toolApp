from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select

from app.db.repositories.base import SqlAlchemyRepository
from app.models import AuditLog, User


class AuditLogRepository(SqlAlchemyRepository[AuditLog]):
    model = AuditLog

    async def search(
        self,
        *,
        actor_id: int | None,
        entity: str | None,
        entity_id: str | None,
        action: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[tuple[AuditLog, str | None]], int]:
        exact = (
            (AuditLog.actor_id, actor_id),
            (AuditLog.entity, entity),
            (AuditLog.entity_id, entity_id),
            (AuditLog.action, action),
        )
        conditions = [column == value for column, value in exact if value is not None]
        if date_from is not None:
            conditions.append(AuditLog.created_at >= date_from)
        if date_to is not None:
            conditions.append(AuditLog.created_at <= date_to)

        statement = (
            select(AuditLog, User.email)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(*conditions)
            .order_by(AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = [(log, email) for log, email in await self.session.execute(statement)]
        total = await self.session.scalar(
            select(func.count()).select_from(AuditLog).where(*conditions)
        )
        return rows, total or 0
