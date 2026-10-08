from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.exceptions import ServiceUnavailableError
from app.models import Currency
from app.services.pricing import PriceConverter

RATE = Decimal("1450")


@pytest.mark.parametrize(
    ("usd", "expected"),
    [
        (Decimal("189.00"), Decimal("274050")),
        (Decimal("0.01"), Decimal("15")),
        (Decimal("0.03"), Decimal("44")),
        (Decimal("3.50"), Decimal("5075")),
    ],
)
def test_usd_to_ars_rounds_half_up_to_whole_pesos(usd: Decimal, expected: Decimal) -> None:
    assert PriceConverter(RATE).from_usd(usd, Currency.ARS) == expected


def test_rounding_step() -> None:
    converter = PriceConverter(RATE, ars_rounding_step=10)

    assert converter.from_usd(Decimal("12.34"), Currency.ARS) == Decimal("17890")
    assert converter.from_usd(Decimal("12.345"), Currency.ARS) == Decimal("17900")


def test_usd_is_returned_with_cents() -> None:
    assert PriceConverter(None).from_usd(Decimal("3.5"), Currency.USD) == Decimal("3.50")


def test_inverse_conversion_for_filters() -> None:
    converter = PriceConverter(RATE)

    assert converter.to_usd(Decimal("145000"), Currency.ARS) == Decimal("100.000000")
    assert converter.to_usd(Decimal("12.50"), Currency.USD) == Decimal("12.50")


def test_ars_without_rate_is_unavailable() -> None:
    with pytest.raises(ServiceUnavailableError) as error:
        PriceConverter(None).from_usd(Decimal("1"), Currency.ARS)

    assert error.value.code == "exchange_rate_unavailable"


async def test_ars_prices_without_exchange_rate_return_503(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"currency": "ARS"})

    assert response.status_code == 503
    assert response.json()["code"] == "exchange_rate_unavailable"


async def test_usd_prices_work_without_exchange_rate(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"currency": "USD"})

    assert response.status_code == 200


async def test_exchange_rate_endpoint(client: AsyncClient, seeded: None) -> None:
    response = await client.get("/api/v1/exchange-rate")

    assert response.status_code == 200
    assert response.json()["rate"] == "1450.000000"
