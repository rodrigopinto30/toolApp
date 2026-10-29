from decimal import Decimal

import pytest

from app.models import Coupon, CouponType, Currency
from app.services.coupons import FixedDiscount, PercentDiscount, discount_for
from app.services.orders import OrderCalculator, OrderLine
from app.services.pricing import PriceConverter
from app.services.shipping import PickupShipping, ZoneShipping

RATE = Decimal("1450")
AMBA = ZoneShipping(Decimal("8.00"), Decimal("150.00"), 1, 3)
ARS = OrderCalculator(PriceConverter(RATE), Currency.ARS)
USD = OrderCalculator(PriceConverter(RATE), Currency.USD)


def _lines(*items: tuple[str, int]) -> list[OrderLine]:
    return [OrderLine(n, Decimal(price), quantity) for n, (price, quantity) in enumerate(items, 1)]


def test_each_unit_price_is_rounded_before_multiplying() -> None:
    calculator = OrderCalculator(
        PriceConverter(Decimal("1333.33"), ars_rounding_step=10), Currency.ARS
    )

    amounts = calculator.line(OrderLine(1, Decimal("1.00"), 3))

    assert (amounts.unit_price, amounts.line_total) == (Decimal("1330"), Decimal("3990"))


def test_usd_order_with_zone_shipping() -> None:
    totals = USD.calculate(_lines(("19.90", 2), ("3.50", 1)), AMBA)

    assert [(line.unit_price, line.line_total) for line in totals.lines] == [
        (Decimal("19.90"), Decimal("39.80")),
        (Decimal("3.50"), Decimal("3.50")),
    ]
    assert (totals.subtotal, totals.discount_total, totals.shipping_total, totals.total) == (
        Decimal("43.30"),
        Decimal("0.00"),
        Decimal("8.00"),
        Decimal("51.30"),
    )
    assert (totals.shipping.eta_min_days, totals.shipping.eta_max_days) == (1, 3)


def test_ars_order_with_percent_discount() -> None:
    totals = ARS.calculate(_lines(("19.90", 2)), AMBA, PercentDiscount(Decimal("10")))

    assert (totals.subtotal, totals.discount_total, totals.shipping_total, totals.total) == (
        Decimal("57710"),
        Decimal("5771"),
        Decimal("11600"),
        Decimal("63539"),
    )


def test_free_shipping_uses_the_subtotal_before_the_discount() -> None:
    totals = USD.calculate(_lines(("150.00", 1)), AMBA, PercentDiscount(Decimal("10")))

    assert totals.shipping.is_free
    assert (totals.discount_total, totals.shipping_total, totals.total) == (
        Decimal("15.00"),
        Decimal("0.00"),
        Decimal("135.00"),
    )


def test_pickup_is_free() -> None:
    totals = ARS.calculate(_lines(("3.50", 1)), PickupShipping())

    assert (totals.shipping_total, totals.total) == (Decimal("0"), Decimal("5075"))


@pytest.mark.parametrize(
    ("calculator", "subtotal", "expected"),
    [(USD, "19.90", "1.99"), (USD, "3.35", "0.34"), (ARS, "28855", "2886")],
)
def test_percent_discount_rounds_with_the_currency_rule(
    calculator: OrderCalculator, subtotal: str, expected: str
) -> None:
    discount = PercentDiscount(Decimal("10"))

    amount = discount.amount(Decimal(subtotal), calculator.converter, calculator.currency)

    assert amount == Decimal(expected)


@pytest.mark.parametrize(
    ("calculator", "subtotal", "expected"),
    [(USD, "20.00", "5.00"), (USD, "3.50", "3.50"), (ARS, "28855", "7250"), (ARS, "5075", "5075")],
)
def test_fixed_discount_is_converted_and_capped_by_the_subtotal(
    calculator: OrderCalculator, subtotal: str, expected: str
) -> None:
    discount = FixedDiscount(Decimal("5.00"))

    amount = discount.amount(Decimal(subtotal), calculator.converter, calculator.currency)

    assert amount == Decimal(expected)


def test_fixed_discount_never_applies_to_shipping() -> None:
    totals = USD.calculate(_lines(("3.50", 1)), AMBA, FixedDiscount(Decimal("5.00")))

    assert (totals.discount_total, totals.shipping_total, totals.total) == (
        Decimal("3.50"),
        Decimal("8.00"),
        Decimal("8.00"),
    )


def test_discount_for_picks_the_strategy_from_the_coupon_type() -> None:
    percent = Coupon(type=CouponType.PERCENT, value=Decimal("10"))
    fixed = Coupon(type=CouponType.FIXED, value=Decimal("5"))

    assert discount_for(percent) == PercentDiscount(Decimal("10"))
    assert discount_for(fixed) == FixedDiscount(Decimal("5"))
