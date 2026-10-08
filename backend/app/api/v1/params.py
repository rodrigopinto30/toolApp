from typing import Annotated

from fastapi import Query, Response

from app.models import Currency, Locale

LocaleQuery = Annotated[Locale, Query()]
CurrencyQuery = Annotated[Currency, Query()]

PUBLIC_MAX_AGE = 60


def public_cache(response: Response) -> None:
    response.headers["Cache-Control"] = f"public, max-age={PUBLIC_MAX_AGE}"
