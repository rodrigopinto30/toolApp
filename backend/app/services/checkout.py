from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import structlog

from app.auth.rate_limit import RateLimiter
from app.core.config import Settings
from app.core.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
)
from app.db.repositories.identity import AddressRepository, BillingProfileRepository
from app.db.repositories.pricing import (
    ExchangeRateRepository,
    PickupPointRepository,
    ProvinceRepository,
)
from app.db.repositories.purchase import CartRepository, CouponRepository, OrderRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import (
    BillingProfile,
    Cart,
    CartItem,
    Coupon,
    CouponRedemption,
    DeliveryMethod,
    Locale,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    User,
)
from app.payments.cards import Card
from app.payments.gateway import ChargeResult, ChargeStatus, PaymentGateway, PaymentUnavailable
from app.schemas.cart import CartLineIssue
from app.schemas.checkout import (
    AppliedCoupon,
    CheckoutDelivery,
    CheckoutPreviewRead,
    CheckoutPreviewRequest,
    CheckoutRequest,
)
from app.schemas.common import MAX_LINES, Money
from app.schemas.orders import OrderRead
from app.schemas.pricing import PickupPointRead, ZoneRead
from app.services.cart import CartEntry, CartPresenter, cart_entries, variant_label
from app.services.catalog import product_translation
from app.services.coupons import CouponContext, CouponPolicy, discount_for
from app.services.orders import (
    PAYMENT_REJECTED,
    OrderCalculator,
    OrderStateMachine,
    OrderTotals,
    billing_snapshot,
    order_number,
    order_read,
    read_order,
    release_order,
    shipping_snapshot,
    subtotal_usd,
    temporary_order_number,
)
from app.services.pricing import PriceConverter, PricingService, zone_read
from app.services.shipping import PickupShipping, ShippingStrategy, ZoneShipping

COUPON_ATTEMPTS = 20
COUPON_WINDOW_SECONDS = 900
PAY_ATTEMPTS = 5
PAY_WINDOW_SECONDS = 900
STOCK_ISSUES = frozenset({CartLineIssue.OUT_OF_STOCK, CartLineIssue.INSUFFICIENT_STOCK})

logger = structlog.get_logger(__name__)


class CheckoutOutcome(StrEnum):
    PAID = "paid"
    PENDING = "pending"
    REJECTED = "rejected"
    EXISTING = "existing"


@dataclass(frozen=True)
class CheckoutResult:
    order: OrderRead
    outcome: CheckoutOutcome


@dataclass(frozen=True)
class DeliveryPlan:
    strategy: ShippingStrategy
    zone: ZoneRead | None = None
    pickup_point: PickupPointRead | None = None
    snapshot: dict[str, Any] | None = None


@dataclass(frozen=True)
class Quote:
    entries: list[CartEntry]
    delivery: DeliveryPlan
    billing: BillingProfile | None
    coupon: Coupon | None
    calculator: OrderCalculator
    totals: OrderTotals


class CheckoutService:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        pricing: PricingService,
        gateway: PaymentGateway,
        limiter: RateLimiter,
        mailer: Mailer,
        settings: Settings,
    ) -> None:
        self.uow = uow
        self.pricing = pricing
        self.gateway = gateway
        self.limiter = limiter
        self.mailer = mailer
        self.settings = settings
        self.coupon_policy = CouponPolicy()
        self.states = OrderStateMachine()

    async def preview(
        self, user_id: int, request: CheckoutPreviewRequest, locale: Locale
    ) -> CheckoutPreviewRead:
        if request.coupon_code is not None:
            await self.limiter.hit(
                "coupon-preview", str(user_id), limit=COUPON_ATTEMPTS, window=COUPON_WINDOW_SECONDS
            )
        converter = await self.pricing.rate_converter()
        async with self.uow:
            cart = await CartRepository(self.uow.session).for_user(user_id)
            entries = await cart_entries(self.uow.session, cart)
            self._check_entries(entries, stock_conflict=False)
            quote = await self._quote(user_id, request, entries, converter, locale, lock=False)
            return self._preview_read(quote, request, locale)

    async def checkout(
        self, user: User, request: CheckoutRequest, key: str, locale: Locale
    ) -> CheckoutResult:
        existing = await self._existing(user.id, key, locale)
        if existing is not None:
            return CheckoutResult(existing, CheckoutOutcome.EXISTING)
        self._ensure_gateway()

        async with self.uow:
            session = self.uow.session
            cart = await CartRepository(session).lock_or_create(user.id)
            replay = await OrderRepository(session).by_idempotency_key(user.id, key, lock=True)
            if replay is not None:
                order = await read_order(session, replay.id, locale)
                return CheckoutResult(order, CheckoutOutcome.EXISTING)
            entries = await cart_entries(session, cart, lock=True)
            self._check_entries(entries, stock_conflict=True)
            rate = await ExchangeRateRepository(session).latest()
            converter = self.pricing.fixed_converter(rate.rate if rate else None)
            quote = await self._quote(user.id, request, entries, converter, locale, lock=True)
            if quote.totals.total != request.expected_total.amount:
                preview = self._preview_read(quote, request, locale)
                raise ConflictError(
                    "The total changed since the preview.",
                    code="total_changed",
                    details={"preview": preview.model_dump(mode="json")},
                )
            order = await self._create_order(user.id, request, key, quote, locale)
            cart.items.clear()
            payment_id, amount = await self._start_payment(order)

        card = request.payment.card()
        return await self._charge(user, order.id, payment_id, amount, card, locale)

    async def pay(
        self, user: User, number: str, card: Card, key: str, locale: Locale
    ) -> CheckoutResult:
        await self.limiter.hit(
            "order-pay", f"{user.id}:{number}", limit=PAY_ATTEMPTS, window=PAY_WINDOW_SECONDS
        )
        async with self.uow:
            order = await OrderRepository(self.uow.session).owned(user.id, number, lock=True)
            if order is None:
                raise NotFoundError("Order not found.")
            if any(payment_key(payment) == key for payment in order.payments):
                read = await order_read(self.uow.session, order, locale)
                return CheckoutResult(read, CheckoutOutcome.EXISTING)
            self.states.ensure(order.status, OrderStatus.PAID)
            self._ensure_gateway()
            payment_id, amount = await self._start_payment(order, key)

        return await self._charge(user, order.id, payment_id, amount, card, locale)

    def _ensure_gateway(self) -> None:
        if not self.gateway.available():
            raise ServiceUnavailableError(
                "Payments are temporarily unavailable.", code="payment_unavailable"
            )

    async def _existing(self, user_id: int, key: str, locale: Locale) -> OrderRead | None:
        async with self.uow:
            order = await OrderRepository(self.uow.session).by_idempotency_key(user_id, key)
            return await read_order(self.uow.session, order.id, locale) if order else None

    def _check_entries(self, entries: Sequence[CartEntry], *, stock_conflict: bool) -> None:
        if not entries:
            raise BusinessRuleViolation("The cart is empty.", code="cart_empty")
        with_issues = [entry for entry in entries if entry.issue is not None]
        short = [entry for entry in with_issues if entry.issue in STOCK_ISSUES]
        if with_issues and not (stock_conflict and len(short) == len(with_issues)):
            raise ConflictError(
                "Some cart items need attention.",
                code="cart_has_issues",
                details={"variant_ids": [entry.variant.id for entry in with_issues]},
            )
        if short:
            raise ConflictError(
                "There is not enough stock.",
                code="insufficient_stock",
                details={
                    "items": [
                        {"variant_id": entry.variant.id, "available": max(entry.variant.stock, 0)}
                        for entry in short
                    ]
                },
            )

    async def _quote(
        self,
        user_id: int,
        request: CheckoutPreviewRequest,
        entries: list[CartEntry],
        converter: PriceConverter,
        locale: Locale,
        *,
        lock: bool,
    ) -> Quote:
        delivery = await self._delivery(user_id, request, locale)
        billing = await self._billing_profile(user_id, request.billing_profile_id)
        coupon = await self._coupon(user_id, request, entries, converter, lock=lock)
        calculator = OrderCalculator(converter, request.currency)
        totals = calculator.calculate(
            [entry.order_line for entry in entries],
            delivery.strategy,
            discount_for(coupon) if coupon else None,
        )
        return Quote(entries, delivery, billing, coupon, calculator, totals)

    def _preview_read(
        self, quote: Quote, request: CheckoutPreviewRequest, locale: Locale
    ) -> CheckoutPreviewRead:
        presenter = CartPresenter(quote.calculator, locale, self.settings.low_stock_threshold)
        totals = quote.totals
        return CheckoutPreviewRead(
            items=[presenter.line(entry) for entry in quote.entries],
            item_count=sum(entry.quantity for entry in quote.entries),
            subtotal=presenter.money(totals.subtotal),
            discount_total=presenter.money(totals.discount_total),
            shipping_total=presenter.money(totals.shipping_total),
            total=presenter.money(totals.total),
            coupon=AppliedCoupon(code=quote.coupon.code, type=quote.coupon.type)
            if quote.coupon
            else None,
            delivery=CheckoutDelivery(
                method=request.delivery_method,
                is_free=totals.shipping.is_free,
                eta_min_days=totals.shipping.eta_min_days,
                eta_max_days=totals.shipping.eta_max_days,
                zone=quote.delivery.zone,
                pickup_point=quote.delivery.pickup_point,
            ),
            exchange_rate=quote.calculator.converter.require_rate(),
            currency=request.currency,
        )

    async def _delivery(
        self, user_id: int, request: CheckoutPreviewRequest, locale: Locale
    ) -> DeliveryPlan:
        session = self.uow.session
        if request.delivery_method == DeliveryMethod.PICKUP:
            point = await PickupPointRepository(session).get_by(
                id=request.pickup_point_id, is_active=True
            )
            if point is None:
                raise NotFoundError("Pickup point not found.")
            return DeliveryPlan(PickupShipping(), pickup_point=PickupPointRead.model_validate(point))

        address = await AddressRepository(session).get_owned(user_id, request.address_id or 0)
        if address is None:
            raise NotFoundError("Address not found.")
        province = await ProvinceRepository(session).get_with_zone(address.province.code)
        if province is None or not province.zone.is_active:
            raise BusinessRuleViolation(
                "Shipping is not available for this address.", code="shipping_unavailable"
            )
        return DeliveryPlan(
            ZoneShipping.from_zone(province.zone),
            zone=zone_read(province.zone, locale),
            snapshot=shipping_snapshot(address, province.zone),
        )

    async def _billing_profile(
        self, user_id: int, profile_id: int | None
    ) -> BillingProfile | None:
        if profile_id is None:
            return None
        profile = await BillingProfileRepository(self.uow.session).get_owned(user_id, profile_id)
        if profile is None:
            raise NotFoundError("Billing profile not found.")
        return profile

    async def _coupon(
        self,
        user_id: int,
        request: CheckoutPreviewRequest,
        entries: Sequence[CartEntry],
        converter: PriceConverter,
        *,
        lock: bool,
    ) -> Coupon | None:
        if request.coupon_code is None:
            return None
        repository = CouponRepository(self.uow.session)
        coupon = await repository.by_code(request.coupon_code, lock=lock)
        context = CouponContext(
            now=utcnow(),
            redemptions=await repository.redemptions(coupon.id, user_id) if coupon else 0,
            subtotal_usd=subtotal_usd([entry.order_line for entry in entries]),
            converter=converter,
            currency=request.currency,
        )
        return self.coupon_policy.check(coupon, context)

    async def _create_order(
        self, user_id: int, request: CheckoutRequest, key: str, quote: Quote, locale: Locale
    ) -> Order:
        totals = quote.totals
        order = Order(
            number=temporary_order_number(),
            user_id=user_id,
            currency=request.currency,
            locale=locale,
            exchange_rate=quote.calculator.converter.require_rate(),
            subtotal=totals.subtotal,
            discount_total=totals.discount_total,
            shipping_total=totals.shipping_total,
            total=totals.total,
            coupon_id=quote.coupon.id if quote.coupon else None,
            delivery_method=request.delivery_method,
            shipping_snapshot=quote.delivery.snapshot,
            billing_snapshot=billing_snapshot(quote.billing),
            pickup_point_id=quote.delivery.pickup_point.id if quote.delivery.pickup_point else None,
            idempotency_key=key,
            items=[
                OrderItem(
                    variant_id=entry.variant.id,
                    sku=entry.variant.sku,
                    product_name=product_translation(entry.variant.product, locale).name,
                    variant_label=variant_label(entry.variant, locale),
                    unit_price=amounts.unit_price,
                    quantity=entry.quantity,
                    line_total=amounts.line_total,
                )
                for entry, amounts in zip(quote.entries, totals.lines, strict=True)
            ],
        )
        self.states.start(order, actor_id=user_id)
        self.uow.session.add(order)
        await self.uow.flush()

        order.number = order_number(order.id, order.created_at.year)
        for entry in quote.entries:
            entry.variant.stock -= entry.quantity
        if quote.coupon is not None:
            quote.coupon.used_count += 1
            self.uow.session.add(
                CouponRedemption(coupon_id=quote.coupon.id, user_id=user_id, order_id=order.id)
            )
        await self.uow.flush()
        return order

    async def _start_payment(self, order: Order, key: str | None = None) -> tuple[int, Money]:
        payment = Payment(
            order_id=order.id,
            provider=self.gateway.name,
            status=PaymentStatus.PENDING,
            amount=order.total,
            currency=order.currency,
            raw_response={"idempotency_key": key} if key else None,
        )
        self.uow.session.add(payment)
        await self.uow.flush()
        return payment.id, Money(amount=order.total, currency=order.currency)

    async def _charge(
        self,
        user: User,
        order_id: int,
        payment_id: int,
        amount: Money,
        card: Card,
        locale: Locale,
    ) -> CheckoutResult:
        try:
            result = await self.gateway.charge(amount, card)
        except PaymentUnavailable:
            async with self.uow:
                pending = await read_order(self.uow.session, order_id, locale)
            return CheckoutResult(pending, CheckoutOutcome.PENDING)

        approved = result.status == ChargeStatus.APPROVED
        async with self.uow:
            session = self.uow.session
            cart = None if approved else await CartRepository(session).lock_or_create(user.id)
            order = await OrderRepository(session).detail(order_id, lock=True)
            payment = next(payment for payment in order.payments if payment.id == payment_id)
            payment.provider_ref = result.provider_ref
            payment.raw_response = {**(payment.raw_response or {}), **result.sanitized()}
            if order.status != OrderStatus.PENDING_PAYMENT:
                await self._settle_late(payment, result)
                outcome = CheckoutOutcome.EXISTING
            elif approved:
                payment.status = PaymentStatus.APPROVED
                self.states.transition(order, OrderStatus.PAID, actor_id=user.id)
                outcome = CheckoutOutcome.PAID
            else:
                payment.status = PaymentStatus.REJECTED
                self.states.transition(
                    order, OrderStatus.CANCELLED, actor_id=user.id, note=PAYMENT_REJECTED
                )
                await release_order(session, order)
                if cart is not None:
                    restore_cart(cart, order)
                outcome = CheckoutOutcome.REJECTED
            await self.uow.flush()
            read = await order_read(session, order, locale)

        if outcome == CheckoutOutcome.PAID:
            self.mailer.order_confirmed(user, read, locale)
        elif outcome == CheckoutOutcome.REJECTED:
            self.mailer.payment_rejected(user, read, locale)
        return CheckoutResult(read, outcome)

    async def _settle_late(self, payment: Payment, result: ChargeResult) -> None:
        if result.status == ChargeStatus.REJECTED:
            payment.status = PaymentStatus.REJECTED
            return
        try:
            await self.gateway.refund(result.provider_ref)
        except PaymentUnavailable:
            payment.status = PaymentStatus.APPROVED
            logger.warning("late_payment_not_refunded", payment_id=payment.id)
            return
        payment.status = PaymentStatus.REFUNDED


def payment_key(payment: Payment) -> str | None:
    return (payment.raw_response or {}).get("idempotency_key")


def restore_cart(cart: Cart, order: Order) -> None:
    lines = {item.variant_id: item for item in cart.items}
    for item in order.items:
        line = lines.get(item.variant_id)
        if line is not None:
            line.quantity = max(line.quantity, item.quantity)
        elif len(cart.items) < MAX_LINES:
            cart.items.append(CartItem(variant_id=item.variant_id, quantity=item.quantity))
