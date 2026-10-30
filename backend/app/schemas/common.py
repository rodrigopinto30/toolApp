import math
from collections.abc import Sequence
from decimal import Decimal
from typing import ClassVar, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Currency

MAX_LINE_QUANTITY = 99
MAX_LINES = 50


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatchModel(RequestModel):
    nullable: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def reject_nulls(self) -> Self:
        for name in self.model_fields_set - self.nullable:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)


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

    @classmethod
    def of(cls, items: list[ItemT], *, page: int, size: int, total: int) -> Self:
        return cls(items=items, page=page, size=size, total=total, pages=math.ceil(total / size))
