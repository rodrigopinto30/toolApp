from collections.abc import Sequence
from dataclasses import dataclass

from app.auth.rate_limit import RateLimiter
from app.core.config import Settings
from app.core.exceptions import BusinessRuleViolation, ConflictError, NotFoundError
from app.db.repositories.identity import AddressRepository, BillingProfileRepository
from app.db.repositories.pricing import PickupPointRepository, ProvinceRepository
from app.db.repositories.purchase import CartRepository, CouponRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Coupon, DeliveryMethod, Locale
from app.schemas.checkout import (
    AppliedCoupon,
    CheckoutDelivery,
    CheckoutPreviewRead,
    CheckoutPreviewRequest,
)
from app.schemas.pricing import PickupPointRead, ZoneRead
from app.services.cart import CartEntry, CartPresenter, cart_entries
from app.services.coupons import CouponContext, CouponPolicy, discount_for
from app.services.orders import OrderCalculator, subtotal_usd
from app.services.pricing import PriceConverter, PricingService, zone_read
from app.services.shipping import PickupShipping, ShippingStrategy, ZoneShipping

COUPON_ATTEMPTS = 20
COUPON_WINDOW_SECONDS = 900


@dataclass(frozen=True)
class DeliveryPlan:
    strategy: ShippingStrategy
    zone: ZoneRead | None = None
    pickup_point: PickupPointRead | None = None


class CheckoutService:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        pricing: PricingService,
        limiter: RateLimiter,
        settings: Settings,
    ) -> None:
        self.uow = uow
        self.pricing = pricing
        self.limiter = limiter
        self.settings = settings
        self.coupon_policy = CouponPolicy()

    async def preview(
        self, user_id: int, request: CheckoutPreviewRequest, locale: Locale
    ) -> CheckoutPreviewRead:
        if request.coupon_code is not None:
            await self.limiter.hit(
                "coupon-preview", str(user_id), limit=COUPON_ATTEMPTS, window=COUPON_WINDOW_SECONDS
            )
        converter = await self.pricing.rate_converter()
        async with self.uow:
            entries = await self._entries(user_id)
            delivery = await self._delivery(user_id, request, locale)
            await self._check_billing_profile(user_id, request.billing_profile_id)
            coupon = await self._coupon(user_id, request, entries, converter)

            calculator = OrderCalculator(converter, request.currency)
            totals = calculator.calculate(
                [entry.order_line for entry in entries],
                delivery.strategy,
                discount_for(coupon) if coupon else None,
            )
            presenter = CartPresenter(calculator, locale, self.settings.low_stock_threshold)
            return CheckoutPreviewRead(
                items=[presenter.line(entry) for entry in entries],
                item_count=sum(entry.quantity for entry in entries),
                subtotal=presenter.money(totals.subtotal),
                discount_total=presenter.money(totals.discount_total),
                shipping_total=presenter.money(totals.shipping_total),
                total=presenter.money(totals.total),
                coupon=AppliedCoupon(code=coupon.code, type=coupon.type) if coupon else None,
                delivery=CheckoutDelivery(
                    method=request.delivery_method,
                    is_free=totals.shipping.is_free,
                    eta_min_days=totals.shipping.eta_min_days,
                    eta_max_days=totals.shipping.eta_max_days,
                    zone=delivery.zone,
                    pickup_point=delivery.pickup_point,
                ),
                exchange_rate=converter.require_rate(),
                currency=request.currency,
            )

    async def _entries(self, user_id: int) -> list[CartEntry]:
        cart = await CartRepository(self.uow.session).for_user(user_id)
        entries = await cart_entries(self.uow.session, cart)
        if not entries:
            raise BusinessRuleViolation("The cart is empty.", code="cart_empty")
        with_issues = [entry.variant.id for entry in entries if entry.issue is not None]
        if with_issues:
            raise ConflictError(
                "Some cart items need attention.",
                code="cart_has_issues",
                details={"variant_ids": with_issues},
            )
        return entries

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
            ZoneShipping.from_zone(province.zone), zone=zone_read(province.zone, locale)
        )

    async def _check_billing_profile(self, user_id: int, profile_id: int | None) -> None:
        if profile_id is None:
            return
        repository = BillingProfileRepository(self.uow.session)
        if await repository.get_owned(user_id, profile_id) is None:
            raise NotFoundError("Billing profile not found.")

    async def _coupon(
        self,
        user_id: int,
        request: CheckoutPreviewRequest,
        entries: Sequence[CartEntry],
        converter: PriceConverter,
    ) -> Coupon | None:
        if request.coupon_code is None:
            return None
        repository = CouponRepository(self.uow.session)
        coupon = await repository.by_code(request.coupon_code)
        context = CouponContext(
            now=utcnow(),
            redemptions=await repository.redemptions(coupon.id, user_id) if coupon else 0,
            subtotal_usd=subtotal_usd([entry.order_line for entry in entries]),
            converter=converter,
            currency=request.currency,
        )
        return self.coupon_policy.check(coupon, context)
