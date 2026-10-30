from datetime import datetime
from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import Field, StringConstraints

from app.schemas.admin.common import I18nText, PositiveUsdAmount, UsdAmount
from app.schemas.common import PatchModel, ReadModel, RequestModel
from app.schemas.validators import text

ZoneCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=2,
        max_length=40,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]
EtaDays = Annotated[int, Field(ge=0, le=365)]
PointName = Annotated[str, text(120)]
PointAddress = Annotated[str, text(255)]
Hours = Annotated[
    dict[Annotated[str, text(40)], Annotated[str, text(80)]], Field(min_length=1, max_length=14)
]


class ExchangeRateCreate(RequestModel):
    rate: Decimal = Field(gt=0, max_digits=18, decimal_places=6)


class AdminExchangeRateRead(ReadModel):
    id: int
    rate: Decimal
    created_by: int | None
    created_at: datetime


class ZoneCreate(RequestModel):
    code: ZoneCode
    name: I18nText
    cost_usd: UsdAmount
    free_over_usd: PositiveUsdAmount | None = None
    eta_min_days: EtaDays
    eta_max_days: EtaDays
    is_active: bool = True


class ZoneUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"free_over_usd"})

    code: ZoneCode | None = None
    name: I18nText | None = None
    cost_usd: UsdAmount | None = None
    free_over_usd: PositiveUsdAmount | None = None
    eta_min_days: EtaDays | None = None
    eta_max_days: EtaDays | None = None
    is_active: bool | None = None


class AdminZoneRead(ReadModel):
    id: int
    code: str
    name: I18nText
    cost_usd: Decimal
    free_over_usd: Decimal | None
    eta_min_days: int
    eta_max_days: int
    is_active: bool


class ProvinceZoneUpdate(PatchModel):
    shipping_zone_id: int | None = Field(None, gt=0)


class AdminProvinceRead(ReadModel):
    code: str
    name: str
    shipping_zone_id: int


class PickupPointCreate(RequestModel):
    name: PointName
    address: PointAddress
    hours: Hours | None = None
    is_active: bool = True


class PickupPointUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"hours"})

    name: PointName | None = None
    address: PointAddress | None = None
    hours: Hours | None = None
    is_active: bool | None = None


class AdminPickupPointRead(ReadModel):
    id: int
    name: str
    address: str
    hours: dict[str, str] | None
    is_active: bool
