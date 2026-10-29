from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from app.models import Currency
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
