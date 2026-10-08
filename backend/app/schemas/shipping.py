from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.models import Currency, DeliveryMethod
from app.schemas.common import Money, RequestModel
from app.schemas.pricing import PickupPointRead, ZoneRead


class QuoteItem(RequestModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=99)


class ShippingQuoteRequest(RequestModel):
    delivery_method: DeliveryMethod
    province_code: str | None = Field(None, min_length=4, max_length=8)
    items: list[QuoteItem] = Field(min_length=1, max_length=50)
    currency: Currency = Currency.ARS

    @model_validator(mode="after")
    def check_request(self) -> Self:
        if self.delivery_method == DeliveryMethod.SHIPPING and not self.province_code:
            raise ValueError("province_code is required for shipping")
        variant_ids = [item.variant_id for item in self.items]
        if len(variant_ids) != len(set(variant_ids)):
            raise ValueError("Each variant can appear only once")
        return self


class ShippingQuoteRead(BaseModel):
    delivery_method: DeliveryMethod
    subtotal: Money
    cost: Money
    is_free: bool
    eta_min_days: int
    eta_max_days: int
    zone: ZoneRead | None
    pickup_points: list[PickupPointRead]
