from pydantic import BaseModel, Field

from app.models import Currency, Locale


class FavoriteParams(BaseModel):
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(24, ge=1, le=48)
    currency: Currency = Currency.ARS
    locale: Locale = Locale.ES
