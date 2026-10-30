from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.common import RequestModel
from app.schemas.validators import text

MAX_INT = 2_147_483_647

UsdAmount = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
PositiveUsdAmount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Position = Annotated[int, Field(ge=0, le=10_000)]


def slug(max_length: int) -> StringConstraints:
    return StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=1,
        max_length=max_length,
        pattern=r"^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$",
    )


class AdminPageParams(BaseModel):
    page: int = Field(1, ge=1, le=100_000)
    size: int = Field(20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


class I18nText(RequestModel):
    es: Annotated[str, text(120)]
    en: Annotated[str, text(120)]


class I18nDescription(RequestModel):
    es: Annotated[str, text(1000)]
    en: Annotated[str, text(1000)]
