from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest

from app.core.exceptions import BusinessRuleViolation
from app.db.types import utcnow
from app.models import Coupon, CouponType, Currency
from app.services.coupons import CouponContext, CouponPolicy
from app.services.pricing import PriceConverter

NOW = utcnow()
POLICY = CouponPolicy()


def _coupon(**overrides: Any) -> Coupon:
    fields: dict[str, Any] = {
        "code": "TEST10",
        "type": CouponType.PERCENT,
        "value": Decimal("10"),
        "min_subtotal_usd": None,
        "starts_at": NOW - timedelta(days=1),
        "ends_at": None,
        "max_uses": None,
        "max_uses_per_user": None,
        "used_count": 0,
        "is_active": True,
    }
    return Coupon(**(fields | overrides))


def _context(
    *, redemptions: int = 0, subtotal_usd: str = "50.00", currency: Currency = Currency.USD
) -> CouponContext:
    return CouponContext(
        now=NOW,
        redemptions=redemptions,
        subtotal_usd=Decimal(subtotal_usd),
        converter=PriceConverter(Decimal("1450")),
        currency=currency,
    )


def _code(coupon: Coupon | None, context: CouponContext) -> str:
    with pytest.raises(BusinessRuleViolation) as error:
        POLICY.check(coupon, context)
    return error.value.code


def test_a_valid_coupon_passes() -> None:
    coupon = _coupon(
        ends_at=NOW + timedelta(days=1),
        max_uses=10,
        used_count=9,
        max_uses_per_user=2,
        min_subtotal_usd=Decimal("50.00"),
    )

    assert POLICY.check(coupon, _context(redemptions=1)) is coupon


@pytest.mark.parametrize(
    ("coupon", "redemptions", "code"),
    [
        (None, 0, "coupon_not_found"),
        (_coupon(is_active=False), 0, "coupon_not_found"),
        (_coupon(starts_at=NOW + timedelta(minutes=1)), 0, "coupon_not_started"),
        (_coupon(ends_at=NOW), 0, "coupon_expired"),
        (_coupon(max_uses=5, used_count=5), 0, "coupon_exhausted"),
        (_coupon(max_uses_per_user=1), 1, "coupon_limit_reached"),
        (_coupon(min_subtotal_usd=Decimal("50.01")), 0, "coupon_min_subtotal"),
    ],
    ids=["unknown", "inactive", "not-started", "expired", "exhausted", "per-user", "minimum"],
)
def test_each_rule_has_its_own_code(coupon: Coupon | None, redemptions: int, code: str) -> None:
    assert _code(coupon, _context(redemptions=redemptions)) == code


def test_rules_are_checked_in_order() -> None:
    coupon = _coupon(
        ends_at=NOW - timedelta(hours=1), max_uses=1, used_count=1, min_subtotal_usd=Decimal("99")
    )

    assert _code(coupon, _context()) == "coupon_expired"


def test_the_minimum_is_reported_in_the_requested_currency() -> None:
    coupon = _coupon(min_subtotal_usd=Decimal("20.00"))

    with pytest.raises(BusinessRuleViolation) as error:
        POLICY.check(coupon, _context(subtotal_usd="19.90", currency=Currency.ARS))

    assert error.value.details == {"min_subtotal": {"amount": "29000", "currency": "ARS"}}
