from datetime import timedelta

import structlog

from app.db.repositories.purchase import OrderRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import OrderStatus, User
from app.services.audit import AuditTrail, diff
from app.services.orders import ORDER_EXPIRED, OrderStateMachine, order_read, release_order
from app.services.revalidation import ChangePublisher

BATCH_SIZE = 100
SYSTEM_AUDIT = AuditTrail(actor_id=None, ip=None, request_id=None)

logger = structlog.get_logger(__name__)


class OrderExpiry:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        mailer: Mailer,
        changes: ChangePublisher,
        ttl_minutes: int,
    ) -> None:
        self.uow = uow
        self.mailer = mailer
        self.changes = changes
        self.ttl = timedelta(minutes=ttl_minutes)
        self.states = OrderStateMachine()

    async def run(self) -> int:
        async with self.uow:
            order_ids = await OrderRepository(self.uow.session).overdue_ids(
                utcnow() - self.ttl, limit=BATCH_SIZE
            )
        expired = 0
        for order_id in order_ids:
            try:
                expired += await self._expire(order_id)
            except Exception:
                logger.exception("order_expiry_failed", order_id=order_id)
        if expired:
            await self.changes.publish("catalog")
        return expired

    async def _expire(self, order_id: int) -> bool:
        async with self.uow:
            session = self.uow.session
            order = await OrderRepository(session).locked_pending(order_id)
            if order is None:
                return False
            before = {"status": order.status}
            self.states.transition(order, OrderStatus.CANCELLED, actor_id=None, note=ORDER_EXPIRED)
            await release_order(session, order)
            await self.uow.flush()
            SYSTEM_AUDIT.record(
                session,
                "status_change",
                "order",
                order.number,
                diff(before, {"status": order.status, "note": ORDER_EXPIRED}),
            )
            customer = await session.get_one(User, order.user_id)
            read = await order_read(session, order, order.locale)
        self.mailer.order_expired(customer, read, order.locale)
        logger.info("order_expired", order=order.number)
        return True
