from app.db.repositories.audit import AuditLogRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.schemas.admin.audit import AuditLogParams, AuditLogRead
from app.schemas.common import Page


class AuditLogAdmin:
    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self.uow = uow

    async def page(self, params: AuditLogParams) -> Page[AuditLogRead]:
        async with self.uow:
            rows, total = await AuditLogRepository(self.uow.session).search(
                actor_id=params.actor_id,
                entity=params.entity,
                entity_id=params.entity_id,
                action=params.action,
                date_from=params.date_from,
                date_to=params.date_to,
                offset=params.offset,
                limit=params.size,
            )
            items = [
                AuditLogRead(
                    id=log.id,
                    actor_id=log.actor_id,
                    actor_email=email,
                    action=log.action,
                    entity=log.entity,
                    entity_id=log.entity_id,
                    changes=log.changes,
                    ip=log.ip,
                    request_id=log.request_id,
                    created_at=log.created_at,
                )
                for log, email in rows
            ]
        return Page.of(items, page=params.page, size=params.size, total=total)
