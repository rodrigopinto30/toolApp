from collections.abc import Sequence
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import Currency

MAX_LINE_QUANTITY = 99
MAX_LINES = 50


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LineItem(RequestModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=MAX_LINE_QUANTITY)


def unique_variants[ItemT: LineItem](items: Sequence[ItemT]) -> Sequence[ItemT]:
    variant_ids = [item.variant_id for item in items]
    if len(variant_ids) != len(set(variant_ids)):
        raise ValueError("Each variant can appear only once")
    return items


class Money(BaseModel):
    amount: Decimal
    currency: Currency


class Page[ItemT](BaseModel):
    items: list[ItemT]
    page: int
    size: int
    total: int
    pages: int
