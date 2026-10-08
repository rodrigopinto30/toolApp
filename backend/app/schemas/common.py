from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models import Currency


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Money(BaseModel):
    amount: Decimal
    currency: Currency


class Page[ItemT](BaseModel):
    items: list[ItemT]
    page: int
    size: int
    total: int
    pages: int
