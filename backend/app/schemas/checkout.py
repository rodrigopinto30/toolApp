from decimal import Decimal
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, Field, SecretStr, StringConstraints, model_validator

from app.db.types import utcnow
from app.models import CouponType, Currency, DeliveryMethod
from app.payments.cards import Card, is_expired, normalize_number, parse_expiry, valid_number
from app.schemas.cart import CartLine
from app.schemas.common import Money, RequestModel
from app.schemas.pricing import PickupPointRead, ZoneRead
from app.schemas.validators import text

CouponCode = Annotated[
    str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=40)
]


def check_card_number(value: SecretStr) -> SecretStr:
    number = normalize_number(value.get_secret_value())
    if not valid_number(number):
        raise ValueError("Invalid card number")
    return SecretStr(number)


def check_expiry(value: str) -> str:
    parsed = parse_expiry(value.strip())
    if parsed is None:
        raise ValueError("Use the MM/YY format")
    if is_expired(*parsed, utcnow()):
        raise ValueError("The card has expired")
    return value.strip()


def check_cvc(value: SecretStr) -> SecretStr:
    cvc = value.get_secret_value()
    if not (cvc.isdigit() and 3 <= len(cvc) <= 4):
        raise ValueError("Invalid security code")
    return value


CardNumber = Annotated[SecretStr, AfterValidator(check_card_number)]
CardExpiry = Annotated[str, AfterValidator(check_expiry)]
CardCvc = Annotated[SecretStr, AfterValidator(check_cvc)]


class CheckoutPreviewRequest(RequestModel):
    delivery_method: DeliveryMethod
    address_id: int | None = Field(None, gt=0)
    pickup_point_id: int | None = Field(None, gt=0)
    billing_profile_id: int | None = Field(None, gt=0)
    coupon_code: CouponCode | None = None
    currency: Currency = Currency.ARS

    @model_validator(mode="after")
    def check_delivery(self) -> Self:
        if self.delivery_method == DeliveryMethod.SHIPPING:
            if self.address_id is None or self.pickup_point_id is not None:
                raise ValueError("Shipping needs address_id and no pickup_point_id")
        elif self.pickup_point_id is None or self.address_id is not None:
            raise ValueError("Pickup needs pickup_point_id and no address_id")
        return self


class AppliedCoupon(BaseModel):
    code: str
    type: CouponType


class CheckoutDelivery(BaseModel):
    method: DeliveryMethod
    is_free: bool
    eta_min_days: int
    eta_max_days: int
    zone: ZoneRead | None
    pickup_point: PickupPointRead | None


class CheckoutPreviewRead(BaseModel):
    items: list[CartLine]
    item_count: int
    subtotal: Money
    discount_total: Money
    shipping_total: Money
    total: Money
    coupon: AppliedCoupon | None
    delivery: CheckoutDelivery
    exchange_rate: Decimal
    currency: Currency


class CardPayment(RequestModel):
    card_number: CardNumber
    expiry: CardExpiry
    cvc: CardCvc
    holder: Annotated[str, text(120)]

    def card(self) -> Card:
        month, year = parse_expiry(self.expiry) or (0, 0)
        return Card(
            number=self.card_number.get_secret_value(),
            expiry_month=month,
            expiry_year=year,
            cvc=self.cvc.get_secret_value(),
            holder=self.holder,
        )


class CheckoutRequest(CheckoutPreviewRequest):
    expected_total: Money
    payment: CardPayment

    @model_validator(mode="after")
    def check_expected_currency(self) -> Self:
        if self.expected_total.currency != self.currency:
            raise ValueError("expected_total must be in the order currency")
        return self
