from typing import Annotated

from fastapi import Header, Query, Response

from app.models import Currency, Locale

LocaleQuery = Annotated[Locale, Query()]
CurrencyQuery = Annotated[Currency, Query()]
IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
]

PUBLIC_MAX_AGE = 60


def public_cache(response: Response) -> None:
    response.headers["Cache-Control"] = f"public, max-age={PUBLIC_MAX_AGE}"
