from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.common import ReadModel


class ExchangeRateRead(BaseModel):
    rate: Decimal
    updated_at: datetime


class ZoneRead(BaseModel):
    code: str
    name: str
    eta_min_days: int
    eta_max_days: int


class ProvinceRead(BaseModel):
    code: str
    name: str
    zone: ZoneRead


class PickupPointRead(ReadModel):
    id: int
    name: str
    address: str
    hours: dict[str, str] | None
