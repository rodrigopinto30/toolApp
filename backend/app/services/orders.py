import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ServiceUnavailableError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.purchase import CouponRepository, OrderRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import (
    Address,
    BillingProfile,
    Coupon,
    Currency,
    DeliveryMethod,
    Locale,
    Order,
    OrderStatus,
    OrderStatusHistory,
    PaymentStatus,
    PickupPoint,
    ShippingZone,
    User,
)
from app.payments.gateway import PaymentGateway, PaymentUnavailable
from app.schemas.checkout import AppliedCoupon
from app.schemas.common import Money, Page
from app.schemas.orders import (
    OrderAddress,
    OrderBilling,
    OrderDelivery,
    OrderItemRead,
    OrderListParams,
    OrderRead,
    OrderStatusChange,
    OrderSummary,
    PaymentRead,
    ShippingSnapshot,
    ZoneSnapshot,
)
from app.schemas.pricing import PickupPointRead, ZoneRead
from app.services.coupons import DiscountStrategy
from app.services.pricing import PriceConverter
from app.services.shipping import ShippingCost, ShippingStrategy


@dataclass(frozen=True)
class OrderLine:
    variant_id: int
    unit_price_usd: Decimal
    quantity: int


@dataclass(frozen=True)
class LineAmounts:
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class OrderTotals:
    lines: list[LineAmounts]
    subtotal: Decimal
    discount_total: Decimal
    shipping_total: Decimal
    total: Decimal
    shipping: ShippingCost


def subtotal_usd(lines: Sequence[OrderLine]) -> Decimal:
    return sum((line.unit_price_usd * line.quantity for line in lines), Decimal(0))


class OrderCalculator:
    def __init__(self, converter: PriceConverter, currency: Currency) -> None:
        self.converter = converter
        self.currency = currency

    def zero(self) -> Decimal:
        return self.converter.round(Decimal(0), self.currency)

    def line(self, line: OrderLine) -> LineAmounts:
        unit_price = self.converter.from_usd(line.unit_price_usd, self.currency)
        return LineAmounts(unit_price=unit_price, line_total=unit_price * line.quantity)

    def calculate(
        self,
        lines: Sequence[OrderLine],
        shipping: ShippingStrategy,
        discount: DiscountStrategy | None = None,
    ) -> OrderTotals:
        amounts = [self.line(line) for line in lines]
        subtotal = sum((amount.line_total for amount in amounts), self.zero())
        discount_total = (
            discount.amount(subtotal, self.converter, self.currency) if discount else self.zero()
        )
        cost = shipping.calculate(subtotal_usd(lines))
        shipping_total = self.converter.from_usd(cost.cost_usd, self.currency)
        return OrderTotals(
            lines=amounts,
            subtotal=subtotal,
            discount_total=discount_total,
            shipping_total=shipping_total,
            total=subtotal - discount_total + shipping_total,
            shipping=cost,
        )


ALLOWED_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.PENDING_PAYMENT: frozenset({OrderStatus.PAID, OrderStatus.CANCELLED}),
    OrderStatus.PAID: frozenset(
        {OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.REFUNDED}
    ),
    OrderStatus.PREPARING: frozenset(
        {OrderStatus.SHIPPED, OrderStatus.READY_FOR_PICKUP, OrderStatus.REFUNDED}
    ),
    OrderStatus.SHIPPED: frozenset({OrderStatus.DELIVERED}),
    OrderStatus.READY_FOR_PICKUP: frozenset({OrderStatus.DELIVERED}),
}

ADMIN_TARGETS = frozenset(
    {
        OrderStatus.PREPARING,
        OrderStatus.SHIPPED,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.DELIVERED,
        OrderStatus.REFUNDED,
    }
)
FOREIGN_STEP: dict[DeliveryMethod, OrderStatus] = {
    DeliveryMethod.SHIPPING: OrderStatus.READY_FOR_PICKUP,
    DeliveryMethod.PICKUP: OrderStatus.SHIPPED,
}

CANCELLED_BY_CUSTOMER = "cancelled_by_customer"
PAYMENT_REJECTED = "payment_rejected"
CUSTOMER_NOTES = frozenset({CANCELLED_BY_CUSTOMER, PAYMENT_REJECTED})


class OrderStateMachine:
    def start(self, order: Order, *, actor_id: int | None) -> None:
        order.status = OrderStatus.PENDING_PAYMENT
        order.status_history = [
            OrderStatusHistory(
                from_status=None, to_status=OrderStatus.PENDING_PAYMENT, changed_by=actor_id
            )
        ]

    def can(self, current: OrderStatus, target: OrderStatus) -> bool:
        return target in ALLOWED_TRANSITIONS.get(current, frozenset())

    def ensure(self, current: OrderStatus, target: OrderStatus) -> None:
        if not self.can(current, target):
            raise self._invalid(current, target)

    def admin_targets(self, order: Order) -> list[OrderStatus]:
        allowed = ALLOWED_TRANSITIONS.get(order.status, frozenset()) & ADMIN_TARGETS
        return sorted(allowed - {FOREIGN_STEP[order.delivery_method]})

    def ensure_admin(self, order: Order, target: OrderStatus) -> None:
        if target not in self.admin_targets(order):
            raise self._invalid(order.status, target)

    def _invalid(self, current: OrderStatus, target: OrderStatus) -> ConflictError:
        return ConflictError(
            f"An order in status {current} cannot change to {target}.",
            code="invalid_transition",
            details={"from": current, "to": target},
        )

    def transition(
        self, order: Order, target: OrderStatus, *, actor_id: int | None, note: str | None = None
    ) -> None:
        self.ensure(order.status, target)
        order.status_history.append(
            OrderStatusHistory(
                from_status=order.status, to_status=target, changed_by=actor_id, note=note
            )
        )
        order.status = target
        if target == OrderStatus.PAID:
            order.paid_at = utcnow()
        elif target == OrderStatus.CANCELLED:
            order.cancelled_at = utcnow()


DISPLAY = PriceConverter(None)


def temporary_order_number() -> str:
    return f"TMP-{uuid.uuid4().hex[:16]}"


def order_number(order_id: int, year: int) -> str:
    return f"TA-{year}-{order_id:06d}"


def shipping_snapshot(address: Address, zone: ShippingZone) -> dict[str, Any]:
    snapshot = ShippingSnapshot(
        **OrderAddress.model_validate(address).model_dump(),
        zone=ZoneSnapshot.model_validate(zone),
    )
    return snapshot.model_dump(mode="json")


def billing_snapshot(profile: BillingProfile | None) -> dict[str, Any] | None:
    return OrderBilling.model_validate(profile).model_dump(mode="json") if profile else None


def present_order(
    order: Order, coupon: Coupon | None, pickup_point: PickupPoint | None, locale: Locale
) -> OrderRead:
    def money(amount: Decimal, currency: Currency = order.currency) -> Money:
        return Money(amount=DISPLAY.round(amount, currency), currency=currency)

    snapshot = (
        ShippingSnapshot.model_validate(order.shipping_snapshot) if order.shipping_snapshot else None
    )
    billing = order.billing_snapshot
    return OrderRead(
        number=order.number,
        status=order.status,
        currency=order.currency,
        exchange_rate=order.exchange_rate,
        items=[
            OrderItemRead(
                variant_id=item.variant_id,
                sku=item.sku,
                product_name=item.product_name,
                variant_label=item.variant_label,
                quantity=item.quantity,
                unit_price=money(item.unit_price),
                line_total=money(item.line_total),
            )
            for item in sorted(order.items, key=lambda item: item.id)
        ],
        subtotal=money(order.subtotal),
        discount_total=money(order.discount_total),
        shipping_total=money(order.shipping_total),
        total=money(order.total),
        coupon=AppliedCoupon(code=coupon.code, type=coupon.type) if coupon else None,
        delivery=OrderDelivery(
            method=order.delivery_method,
            address=OrderAddress.model_validate(snapshot.model_dump(exclude={"zone"}))
            if snapshot
            else None,
            zone=ZoneRead(
                code=snapshot.zone.code,
                name=snapshot.zone.name[locale],
                eta_min_days=snapshot.zone.eta_min_days,
                eta_max_days=snapshot.zone.eta_max_days,
            )
            if snapshot
            else None,
            pickup_point=PickupPointRead.model_validate(pickup_point) if pickup_point else None,
        ),
        billing=OrderBilling.model_validate(billing) if billing else None,
        status_history=[
            OrderStatusChange(
                from_status=change.from_status,
                to_status=change.to_status,
                note=change.note if change.note in CUSTOMER_NOTES else None,
                created_at=change.created_at,
            )
            for change in order.status_history
        ],
        payments=[
            PaymentRead(
                status=payment.status,
                amount=money(payment.amount, payment.currency),
                brand=(payment.raw_response or {}).get("brand"),
                last4=(payment.raw_response or {}).get("last4"),
                created_at=payment.created_at,
            )
            for payment in order.payments
        ],
        created_at=order.created_at,
        paid_at=order.paid_at,
        cancelled_at=order.cancelled_at,
    )


async def read_order(session: AsyncSession, order_id: int, locale: Locale) -> OrderRead:
    return await order_read(session, await OrderRepository(session).detail(order_id), locale)


async def order_read(session: AsyncSession, order: Order, locale: Locale) -> OrderRead:
    coupon = await session.get(Coupon, order.coupon_id) if order.coupon_id else None
    point = await session.get(PickupPoint, order.pickup_point_id) if order.pickup_point_id else None
    return present_order(order, coupon, point, locale)


async def release_order(session: AsyncSession, order: Order) -> None:
    quantities = {item.variant_id: item.quantity for item in order.items}
    variants = await ProductRepository(session).variants_with_details(list(quantities), lock=True)
    for variant in variants:
        variant.stock += quantities[variant.id]
    if order.coupon_id is not None:
        coupons = CouponRepository(session)
        coupon = await coupons.locked(order.coupon_id)
        if coupon is not None:
            coupon.used_count = max(coupon.used_count - 1, 0)
        await coupons.remove_redemption(order.id)


async def refund_payments(gateway: PaymentGateway, order: Order) -> bool:
    approved = [p for p in order.payments if p.status == PaymentStatus.APPROVED]
    for payment in approved:
        try:
            await gateway.refund(payment.provider_ref or "")
        except PaymentUnavailable as exc:
            raise ServiceUnavailableError(
                "Refunds are temporarily unavailable.", code="payment_unavailable"
            ) from exc
        payment.status = PaymentStatus.REFUNDED
    return bool(approved)


def summarize_order(order: Order, item_count: int) -> OrderSummary:
    return OrderSummary(
        number=order.number,
        status=order.status,
        total=Money(amount=DISPLAY.round(order.total, order.currency), currency=order.currency),
        item_count=item_count,
        created_at=order.created_at,
    )


class OrderService:
    def __init__(
        self, uow: SqlAlchemyUnitOfWork, gateway: PaymentGateway, mailer: Mailer
    ) -> None:
        self.uow = uow
        self.gateway = gateway
        self.mailer = mailer
        self.states = OrderStateMachine()

    async def page(self, user_id: int, params: OrderListParams) -> Page[OrderSummary]:
        async with self.uow:
            rows, total = await OrderRepository(self.uow.session).page_for(
                user_id, offset=(params.page - 1) * params.size, limit=params.size
            )
            items = [summarize_order(order, item_count) for order, item_count in rows]
        return Page[OrderSummary](
            items=items,
            page=params.page,
            size=params.size,
            total=total,
            pages=math.ceil(total / params.size),
        )

    async def detail(self, user_id: int, number: str, locale: Locale) -> OrderRead:
        async with self.uow:
            order = await self._owned(user_id, number)
            return await order_read(self.uow.session, order, locale)

    async def cancel(self, user: User, number: str, locale: Locale) -> OrderRead:
        async with self.uow:
            order = await self._owned(user.id, number, lock=True)
            self.states.ensure(order.status, OrderStatus.CANCELLED)
            refunded = await refund_payments(self.gateway, order)
            self.states.transition(
                order, OrderStatus.CANCELLED, actor_id=user.id, note=CANCELLED_BY_CUSTOMER
            )
            await release_order(self.uow.session, order)
            await self.uow.flush()
            read = await order_read(self.uow.session, order, locale)
        self.mailer.order_cancelled(user, read, refunded, order.locale)
        return read

    async def _owned(self, user_id: int, number: str, *, lock: bool = False) -> Order:
        order = await OrderRepository(self.uow.session).owned(user_id, number, lock=lock)
        if order is None:
            raise NotFoundError("Order not found.")
        return order
