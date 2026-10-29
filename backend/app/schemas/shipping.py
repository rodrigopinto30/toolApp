from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, Field, model_validator

from app.models import Currency, DeliveryMethod
from app.schemas.common import MAX_LINES, LineItem, Money, RequestModel, unique_variants
from app.schemas.pricing import PickupPointRead, ZoneRead


class ShippingQuoteRequest(RequestModel):
    delivery_method: DeliveryMethod
    province_code: str | None = Field(None, min_length=4, max_length=8)
    items: Annotated[
        list[LineItem], Field(min_length=1, max_length=MAX_LINES), AfterValidator(unique_variants)
    ]
    currency: Currency = Currency.ARS

    @model_validator(mode="after")
    def check_request(self) -> Self:
        if self.delivery_method == DeliveryMethod.SHIPPING and not self.province_code:
            raise ValueError("province_code is required for shipping")
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
