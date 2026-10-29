from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from app.core.exceptions import BusinessRuleViolation
from app.models import Coupon, CouponType, Currency
from app.services.pricing import PriceConverter


class DiscountStrategy(Protocol):
    def amount(self, subtotal: Decimal, converter: PriceConverter, currency: Currency) -> Decimal: ...


@dataclass(frozen=True)
class PercentDiscount:
    percent: Decimal

    def amount(self, subtotal: Decimal, converter: PriceConverter, currency: Currency) -> Decimal:
        return converter.round(subtotal * self.percent / 100, currency)


@dataclass(frozen=True)
class FixedDiscount:
    amount_usd: Decimal

    def amount(self, subtotal: Decimal, converter: PriceConverter, currency: Currency) -> Decimal:
        return min(converter.from_usd(self.amount_usd, currency), subtotal)


def discount_for(coupon: Coupon) -> DiscountStrategy:
    if coupon.type == CouponType.PERCENT:
        return PercentDiscount(coupon.value)
    return FixedDiscount(coupon.value)


@dataclass(frozen=True)
class CouponContext:
    now: datetime
    redemptions: int
    subtotal_usd: Decimal
    converter: PriceConverter
    currency: Currency


class CouponPolicy:
    def check(self, coupon: Coupon | None, context: CouponContext) -> Coupon:
        if coupon is None or not coupon.is_active:
            raise BusinessRuleViolation("The coupon does not exist.", code="coupon_not_found")
        if coupon.starts_at > context.now:
            raise BusinessRuleViolation("The coupon is not valid yet.", code="coupon_not_started")
        if coupon.ends_at is not None and coupon.ends_at <= context.now:
            raise BusinessRuleViolation("The coupon has expired.", code="coupon_expired")
        if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
            raise BusinessRuleViolation("The coupon has no uses left.", code="coupon_exhausted")
        if coupon.max_uses_per_user is not None and context.redemptions >= coupon.max_uses_per_user:
            raise BusinessRuleViolation(
                "You already used this coupon.", code="coupon_limit_reached"
            )
        if coupon.min_subtotal_usd is not None and context.subtotal_usd < coupon.min_subtotal_usd:
            minimum = context.converter.money(coupon.min_subtotal_usd, context.currency)
            raise BusinessRuleViolation(
                "The subtotal is below the coupon minimum.",
                code="coupon_min_subtotal",
                details={"min_subtotal": minimum.model_dump(mode="json")},
            )
        return coupon
