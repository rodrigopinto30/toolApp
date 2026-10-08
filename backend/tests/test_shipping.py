from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductVariant
from app.services.shipping import PickupShipping, ZoneShipping

ZONE = ZoneShipping(Decimal("8.00"), Decimal("150.00"), 1, 3)


def test_pickup_is_free() -> None:
    cost = PickupShipping().calculate(Decimal("10.00"))

    assert cost.is_free
    assert (cost.eta_min_days, cost.eta_max_days) == (0, 0)


def test_zone_cost_below_threshold() -> None:
    cost = ZONE.calculate(Decimal("149.99"))

    assert cost.cost_usd == Decimal("8.00")
    assert not cost.is_free


def test_zone_is_free_from_threshold() -> None:
    assert ZONE.calculate(Decimal("150.00")).is_free


def test_zone_without_threshold_always_charges() -> None:
    zone = ZoneShipping(Decimal("8.00"), None, 1, 3)

    assert zone.calculate(Decimal("100000")).cost_usd == Decimal("8.00")


async def _variant_id(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))


async def _quote(client: AsyncClient, **body: object) -> Response:
    return await client.post("/api/v1/shipping/quote", json=body)


@pytest.mark.usefixtures("seeded")
async def test_quote_small_cart_pays_zone_cost(client: AsyncClient, session: AsyncSession) -> None:
    screwdrivers = await _variant_id(session, "STA-SD6")

    response = await _quote(
        client,
        delivery_method="shipping",
        province_code="AR-C",
        items=[{"variant_id": screwdrivers, "quantity": 2}],
        currency="USD",
    )

    body = response.json()
    assert response.status_code == 200
    assert body["subtotal"] == {"amount": "39.80", "currency": "USD"}
    assert body["cost"] == {"amount": "8.00", "currency": "USD"}
    assert body["zone"]["code"] == "amba"
    assert not body["is_free"]


@pytest.mark.usefixtures("seeded")
async def test_quote_over_threshold_is_free_in_ars(client: AsyncClient, session: AsyncSession) -> None:
    drill = await _variant_id(session, "BOS-HD18-18V")

    response = await _quote(
        client,
        delivery_method="shipping",
        province_code="AR-C",
        items=[{"variant_id": drill, "quantity": 1}],
    )

    body = response.json()
    assert body["subtotal"] == {"amount": "274050", "currency": "ARS"}
    assert body["cost"] == {"amount": "0", "currency": "ARS"}
    assert body["is_free"]


@pytest.mark.usefixtures("seeded")
async def test_quote_pickup_lists_pickup_points(client: AsyncClient, session: AsyncSession) -> None:
    gloves = await _variant_id(session, "TRU-WG-M")

    response = await _quote(
        client, delivery_method="pickup", items=[{"variant_id": gloves, "quantity": 1}]
    )

    body = response.json()
    assert body["is_free"]
    assert body["zone"] is None
    assert len(body["pickup_points"]) == 1


@pytest.mark.usefixtures("seeded")
async def test_quote_unknown_province(client: AsyncClient, session: AsyncSession) -> None:
    gloves = await _variant_id(session, "TRU-WG-M")

    response = await _quote(
        client,
        delivery_method="shipping",
        province_code="AR-ZZ",
        items=[{"variant_id": gloves, "quantity": 1}],
    )

    assert response.status_code == 422
    assert response.json()["code"] == "unknown_province"


@pytest.mark.usefixtures("seeded")
async def test_quote_inactive_variant(client: AsyncClient, session: AsyncSession) -> None:
    variant = await session.scalar(select(ProductVariant).where(ProductVariant.sku == "TRU-WG-M"))
    variant.is_active = False
    await session.flush()

    response = await _quote(
        client, delivery_method="pickup", items=[{"variant_id": variant.id, "quantity": 1}]
    )

    assert response.status_code == 422
    assert response.json()["details"] == {"variant_ids": [variant.id]}


@pytest.mark.parametrize(
    "body",
    [
        {"delivery_method": "shipping", "items": [{"variant_id": 1, "quantity": 1}]},
        {"delivery_method": "pickup", "items": [{"variant_id": 1, "quantity": 0}]},
        {"delivery_method": "pickup", "items": [{"variant_id": 1, "quantity": 100}]},
        {"delivery_method": "pickup", "items": []},
        {
            "delivery_method": "pickup",
            "items": [{"variant_id": 1, "quantity": 1}, {"variant_id": 1, "quantity": 2}],
        },
        {"delivery_method": "pickup", "items": [{"variant_id": 1, "quantity": 1}], "price": 1},
    ],
)
async def test_quote_rejects_invalid_requests(client: AsyncClient, body: dict) -> None:
    response = await client.post("/api/v1/shipping/quote", json=body)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
