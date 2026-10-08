from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductVariant

pytestmark = pytest.mark.usefixtures("seeded")

POWER_TOOLS = {
    "bosch-cordless-hammer-drill-18v",
    "makita-hammer-drill",
    "dewalt-drill-driver-20v",
    "black-decker-drill-driver-12v",
    "bosch-angle-grinder-115",
    "makita-cordless-angle-grinder-18v",
    "dewalt-circular-saw-184",
    "bosch-jigsaw",
}
DRILLS = {
    "bosch-cordless-hammer-drill-18v",
    "makita-hammer-drill",
    "dewalt-drill-driver-20v",
    "black-decker-drill-driver-12v",
}


async def _slugs(client: AsyncClient, **params: object) -> list[str]:
    response = await client.get("/api/v1/products", params={"currency": "USD", **params})
    assert response.status_code == 200, response.text
    return [item["slug"] for item in response.json()["items"]]


async def test_no_filters_lists_every_product(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"size": 48})

    assert response.json()["total"] == 21


async def test_category_includes_descendants(client: AsyncClient) -> None:
    assert set(await _slugs(client, category="power-tools")) == POWER_TOOLS
    assert set(await _slugs(client, category="drills")) == DRILLS


async def test_unknown_category_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"category": "nope"})

    assert response.status_code == 404


async def test_brands_are_ored(client: AsyncClient) -> None:
    assert len(await _slugs(client, brand="bosch")) == 4
    assert len(await _slugs(client, brand=["bosch", "makita"])) == 6


async def test_values_of_one_attribute_are_ored(client: AsyncClient) -> None:
    assert set(await _slugs(client, **{"attr[]": "voltage:18v"})) == {
        "bosch-cordless-hammer-drill-18v",
        "makita-cordless-angle-grinder-18v",
    }
    assert len(await _slugs(client, **{"attr[]": ["voltage:18v", "voltage:20v"]})) == 3


async def test_different_attributes_must_match_the_same_variant(client: AsyncClient) -> None:
    assert await _slugs(client, **{"attr[]": ["voltage:18v", "power:750w"]}) == []
    assert set(await _slugs(client, **{"attr[]": ["power:750w"]})) == {
        "makita-hammer-drill",
        "bosch-angle-grinder-115",
    }


async def test_price_range_in_usd(client: AsyncClient) -> None:
    slugs = await _slugs(client, min_price="100", max_price="150")

    assert set(slugs) == {"makita-cordless-angle-grinder-18v", "dewalt-circular-saw-184"}


async def test_price_range_in_ars(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/products",
        params={"currency": "ARS", "min_price": "145000", "max_price": "217500"},
    )

    slugs = {item["slug"] for item in response.json()["items"]}
    assert slugs == {"makita-cordless-angle-grinder-18v", "dewalt-circular-saw-184"}


async def test_invalid_price_range_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"min_price": "10", "max_price": "5"})

    assert response.status_code == 422


async def test_in_stock(client: AsyncClient, session: AsyncSession) -> None:
    variant = await session.scalar(select(ProductVariant).where(ProductVariant.sku == "BOS-LDM40"))
    variant.stock = 0
    await session.flush()

    slugs = await _slugs(client, in_stock=True, size=48)

    assert "bosch-laser-distance-meter-40m" not in slugs
    assert len(slugs) == 20


async def test_short_query_falls_back_to_substring(client: AsyncClient) -> None:
    assert await _slugs(client, q="3M") == []
    assert "stanley-tape-measure" in await _slugs(client, q="ci")


@pytest.mark.parametrize(
    ("sort", "first"),
    [
        ("price_asc", "truper-nylon-wall-plugs-100"),
        ("price_desc", "bosch-cordless-hammer-drill-18v"),
        ("name", "bosch-angle-grinder-115"),
    ],
)
async def test_sorting(client: AsyncClient, sort: str, first: str) -> None:
    assert (await _slugs(client, sort=sort, locale="en"))[0] == first


async def test_price_sorting_is_monotonic(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/products", params={"currency": "USD", "sort": "price_asc", "size": 48}
    )
    prices = [Decimal(item["price_from"]["amount"]) for item in response.json()["items"]]

    assert prices == sorted(prices)


async def test_pagination(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"size": 5, "page": 5, "sort": "name"})

    body = response.json()
    assert (body["total"], body["pages"], body["page"], len(body["items"])) == (21, 5, 5, 1)


@pytest.mark.parametrize("params", [{"size": 49}, {"page": 0}, {"attr[]": "voltage"}, {"sort": "x"}])
async def test_invalid_query_params(client: AsyncClient, params: dict) -> None:
    response = await client.get("/api/v1/products", params=params)

    assert response.status_code == 422
