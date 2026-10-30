from app.core.exceptions import NotFoundError
from app.db.repositories.purchase import OrderRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import Order, OrderStatus, User
from app.payments.gateway import PaymentGateway
from app.schemas.admin.orders import (
    AdminOrderParams,
    AdminOrderRead,
    AdminOrderSummary,
    OrderStatusUpdate,
)
from app.schemas.common import Page
from app.services.audit import AuditTrail, diff
from app.services.orders import (
    OrderStateMachine,
    order_read,
    refund_payments,
    release_order,
    summarize_order,
)
from app.services.revalidation import ChangePublisher


class OrderAdmin:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        audit: AuditTrail,
        changes: ChangePublisher,
        gateway: PaymentGateway,
        mailer: Mailer,
    ) -> None:
        self.uow = uow
        self.audit = audit
        self.changes = changes
        self.gateway = gateway
        self.mailer = mailer
        self.states = OrderStateMachine()

    async def search(self, params: AdminOrderParams) -> Page[AdminOrderSummary]:
        async with self.uow:
            rows, total = await OrderRepository(self.uow.session).search(
                status=params.status,
                number=params.number,
                email=params.email,
                date_from=params.date_from,
                date_to=params.date_to,
                offset=params.offset,
                limit=params.size,
            )
            items = [
                AdminOrderSummary.from_order(summarize_order(order, count), order, customer)
                for order, count, customer in rows
            ]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def detail(self, number: str) -> AdminOrderRead:
        async with self.uow:
            order = await self._order(number)
            return await self._present(order, await self._customer(order))

    async def change_status(self, number: str, body: OrderStatusUpdate) -> AdminOrderRead:
        refund = body.status == OrderStatus.REFUNDED
        async with self.uow:
            order = await self._order(number, lock=True)
            self.states.ensure_admin(order, body.status)
            before = {"status": order.status}
            if refund:
                await refund_payments(self.gateway, order)
            self.states.transition(order, body.status, actor_id=self.audit.actor_id, note=body.note)
            if refund:
                await release_order(self.uow.session, order)
            await self.uow.flush()
            self.audit.record(
                self.uow.session,
                "status_change",
                "order",
                order.number,
                diff(before, {"status": body.status, "note": body.note}),
            )
            customer = await self._customer(order)
            read = await self._present(order, customer)
        if refund:
            await self.changes.publish("catalog")
        self.mailer.order_status_changed(customer, read, order.locale)
        return read

    async def _order(self, number: str, *, lock: bool = False) -> Order:
        order = await OrderRepository(self.uow.session).by_number(number, lock=lock)
        if order is None:
            raise NotFoundError("Order not found.")
        return order

    async def _customer(self, order: Order) -> User:
        customer = await self.uow.repository(User).get(order.user_id)
        if customer is None:
            raise NotFoundError()
        return customer

    async def _present(self, order: Order, customer: User) -> AdminOrderRead:
        read = await order_read(self.uow.session, order, order.locale)
        next_statuses = self.states.admin_targets(order)
        return AdminOrderRead.from_order(read, order, customer, next_statuses)
