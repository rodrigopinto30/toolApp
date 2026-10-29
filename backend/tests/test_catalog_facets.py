from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.usefixtures("seeded")

DRILL_BRANDS = {"black-decker": 1, "bosch": 1, "dewalt": 1, "makita": 1}


async def _facets(client: AsyncClient, **params: object) -> dict[str, Any]:
    response = await client.get("/api/v1/products/facets", params={"currency": "USD", **params})
    assert response.status_code == 200, response.text
    return response.json()


async def _total(client: AsyncClient, **params: object) -> int:
    response = await client.get("/api/v1/products", params={"currency": "USD", **params})
    assert response.status_code == 200, response.text
    return response.json()["total"]


def _counts(values: list[dict[str, Any]]) -> dict[str, int]:
    return {value["slug"]: value["count"] for value in values}


def _attributes(facets: dict[str, Any]) -> dict[str, dict[str, int]]:
    return {attribute["code"]: _counts(attribute["values"]) for attribute in facets["attributes"]}


async def test_facets_describe_the_whole_catalog(client: AsyncClient) -> None:
    facets = await _facets(client, locale="en")

    assert sum(_counts(facets["brands"]).values()) == 21
    assert facets["brands"][0] == {"slug": "3m", "label": "3M", "count": 1}
    assert _attributes(facets)["voltage"] == {"12v": 1, "18v": 2, "20v": 1}
    assert facets["attributes"][0]["name"] == "Voltage"


async def test_facets_only_offer_values_present_in_the_listing(client: AsyncClient) -> None:
    facets = await _facets(client, category="drills")

    assert _counts(facets["brands"]) == DRILL_BRANDS
    assert set(_attributes(facets)) == {"voltage", "power"}


async def test_a_facet_ignores_its_own_selection(client: AsyncClient) -> None:
    facets = await _facets(client, category="drills", brand="bosch")

    assert _counts(facets["brands"]) == DRILL_BRANDS
    assert _attributes(facets) == {"voltage": {"18v": 1}}


async def test_attribute_values_count_variants_that_match_every_selected_attribute(
    client: AsyncClient,
) -> None:
    facets = await _facets(client, **{"attr[]": "voltage:18v"})

    assert _attributes(facets) == {"voltage": {"12v": 1, "18v": 2, "20v": 1}}
    assert _counts(facets["brands"]) == {"bosch": 1, "makita": 1}


async def test_the_price_range_ignores_the_price_filter_and_covers_the_listing(
    client: AsyncClient,
) -> None:
    facets = await _facets(client, category="hand-tools", min_price="20")
    price = facets["price"]

    assert price == {
        "min": {"amount": "9.90", "currency": "USD"},
        "max": {"amount": "54.00", "currency": "USD"},
    }
    bounded = await _total(
        client, category="hand-tools", min_price=price["min"]["amount"], max_price=price["max"]["amount"]
    )
    assert bounded == await _total(client, category="hand-tools") == 6


async def test_the_price_range_in_ars_matches_the_prices_shown(client: AsyncClient) -> None:
    price = (await _facets(client, currency="ARS"))["price"]

    assert price["min"] == {"amount": "5075", "currency": "ARS"}
    bounded = await _total(
        client, currency="ARS", min_price=price["min"]["amount"], max_price=price["max"]["amount"]
    )
    assert bounded == 21


async def test_no_results_mean_no_facets(client: AsyncClient) -> None:
    assert await _facets(client, q="zzzz") == {"brands": [], "attributes": [], "price": None}


async def test_unknown_category_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products/facets", params={"category": "nope"})

    assert response.status_code == 404


async def test_listing_parameters_are_rejected(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products/facets", params={"sort": "name"})

    assert response.status_code == 422
