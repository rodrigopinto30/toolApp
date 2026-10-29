from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models import CouponType, Currency, DeliveryMethod
from app.schemas.cart import CartLine
from app.schemas.common import Money, RequestModel
from app.schemas.pricing import PickupPointRead, ZoneRead

CouponCode = Annotated[
    str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=40)
]


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
