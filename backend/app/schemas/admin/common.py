from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.common import RequestModel
from app.schemas.validators import text

MAX_INT = 2_147_483_647

UsdAmount = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
PositiveUsdAmount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class AdminPageParams(BaseModel):
    page: int = Field(1, ge=1, le=100_000)
    size: int = Field(20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


class I18nText(RequestModel):
    es: Annotated[str, text(120)]
    en: Annotated[str, text(120)]
