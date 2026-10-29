import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.purchase import CouponRepository, OrderRepository
from app.db.types import utcnow
from app.models import (
    Address,
    BillingProfile,
    Coupon,
    Currency,
    Locale,
    Order,
    OrderStatus,
    OrderStatusHistory,
    PickupPoint,
    ShippingZone,
)
from app.schemas.checkout import AppliedCoupon
from app.schemas.common import Money
from app.schemas.orders import (
    OrderAddress,
    OrderBilling,
    OrderDelivery,
    OrderItemRead,
    OrderRead,
    OrderStatusChange,
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

    def transition(
        self, order: Order, target: OrderStatus, *, actor_id: int | None, note: str | None = None
    ) -> None:
        if not self.can(order.status, target):
            raise ConflictError(
                f"An order in status {order.status} cannot change to {target}.",
                code="invalid_transition",
                details={"from": order.status, "to": target},
            )
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
                note=change.note,
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
    order = await OrderRepository(session).detail(order_id)
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
