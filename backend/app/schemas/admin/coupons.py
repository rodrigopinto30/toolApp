from datetime import datetime
from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import AwareDatetime, Field, StringConstraints

from app.db.types import utcnow
from app.models import CouponType
from app.schemas.admin.common import MAX_INT, PositiveUsdAmount, UsdAmount
from app.schemas.common import PatchModel, ReadModel, RequestModel

CouponCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_upper=True,
        min_length=3,
        max_length=40,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]
UseLimit = Annotated[int, Field(gt=0, le=MAX_INT)]


class CouponCreate(RequestModel):
    code: CouponCode
    type: CouponType
    value: PositiveUsdAmount
    min_subtotal_usd: UsdAmount | None = None
    starts_at: AwareDatetime = Field(default_factory=utcnow)
    ends_at: AwareDatetime | None = None
    max_uses: UseLimit | None = None
    max_uses_per_user: UseLimit | None = None
    is_active: bool = True


class CouponUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset(
        {"min_subtotal_usd", "ends_at", "max_uses", "max_uses_per_user"}
    )

    code: CouponCode | None = None
    type: CouponType | None = None
    value: PositiveUsdAmount | None = None
    min_subtotal_usd: UsdAmount | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    max_uses: UseLimit | None = None
    max_uses_per_user: UseLimit | None = None
    is_active: bool | None = None


class AdminCouponRead(ReadModel):
    id: int
    code: str
    type: CouponType
    value: Decimal
    min_subtotal_usd: Decimal | None
    starts_at: datetime
    ends_at: datetime | None
    max_uses: int | None
    max_uses_per_user: int | None
    used_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
