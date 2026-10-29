from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.types import utcnow
from app.models import (
    Address,
    Coupon,
    CouponRedemption,
    Currency,
    DeliveryMethod,
    Order,
    PickupPoint,
    ProductVariant,
    ShippingZone,
    User,
)
from tests.factories import make_user
from tests.shopping import (
    PASSWORD,
    add_to_cart,
    address_for,
    billing_profile,
    pickup_body,
    shipping_body,
)

pytestmark = pytest.mark.usefixtures("seeded")

PREVIEW = "/api/v1/checkout/preview"


async def _preview(client: AsyncClient, locale: str = "es", **body: Any) -> Response:
    return await client.post(PREVIEW, json=body, params={"locale": locale})


def _amounts(body: dict[str, Any]) -> tuple[str, ...]:
    keys = ("subtotal", "discount_total", "shipping_total", "total")
    return tuple(body[key]["amount"] for key in keys)


async def _redeem(session: AsyncSession, user: User, code: str) -> None:
    order = Order(
        number=f"TA-TEST-{user.id}",
        user_id=user.id,
        currency=Currency.USD,
        exchange_rate=Decimal("1450"),
        subtotal=Decimal("10.00"),
        discount_total=Decimal("5.00"),
        shipping_total=Decimal("0.00"),
        total=Decimal("5.00"),
        delivery_method=DeliveryMethod.PICKUP,
    )
    session.add(order)
    await session.flush()
    coupon_id = await session.scalar(select(Coupon.id).where(Coupon.code == code))
    session.add(CouponRedemption(coupon_id=coupon_id, user_id=user.id, order_id=order.id))
    await session.flush()


async def test_preview_requires_a_verified_email(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, password=PASSWORD)
    await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})

    response = await _preview(client, delivery_method="pickup", pickup_point_id=1)

    assert response.status_code == 403
    assert response.json()["code"] == "email_not_verified"


async def test_preview_with_shipping(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await add_to_cart(client, session, "STA-SD6", 2)

    response = await _preview(client, locale="en", **shipping_body(address))

    body = response.json()
    assert response.status_code == 200
    assert [(line["sku"], line["product_name"], line["quantity"]) for line in body["items"]] == [
        ("STA-SD6", "6-piece screwdriver set", 2)
    ]
    assert body["items"][0]["line_total"] == {"amount": "39.80", "currency": "USD"}
    assert _amounts(body) == ("39.80", "0.00", "8.00", "47.80")
    assert body["delivery"] == {
        "method": "shipping",
        "is_free": False,
        "eta_min_days": 1,
        "eta_max_days": 3,
        "zone": {"code": "amba", "name": "AMBA", "eta_min_days": 1, "eta_max_days": 3},
        "pickup_point": None,
    }
    assert (body["item_count"], body["coupon"], body["currency"]) == (2, None, "USD")
    assert Decimal(body["exchange_rate"]) == Decimal("1450")


async def test_preview_in_ars_with_a_percent_coupon(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await add_to_cart(client, session, "STA-SD6", 2)

    response = await _preview(
        client, **shipping_body(address, currency="ARS", coupon_code=" bienvenida10 ")
    )

    body = response.json()
    assert response.status_code == 200
    assert _amounts(body) == ("57710", "5771", "11600", "63539")
    assert body["coupon"] == {"code": "BIENVENIDA10", "type": "percent"}


async def test_free_shipping_uses_the_subtotal_before_the_discount(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)

    body = (await _preview(client, **shipping_body(address, coupon_code="BIENVENIDA10"))).json()

    assert _amounts(body) == ("189.00", "18.90", "0.00", "170.10")
    assert body["delivery"]["is_free"] is True


@pytest.mark.usefixtures("customer")
async def test_preview_with_pickup_and_a_fixed_coupon(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "TRU-WP-6", 1)

    body = (await _preview(client, **pickup_body(pickup_point_id, coupon_code="ENVIO5"))).json()

    assert _amounts(body) == ("3.50", "3.50", "0.00", "0.00")
    assert body["coupon"] == {"code": "ENVIO5", "type": "fixed"}
    assert body["delivery"]["pickup_point"]["id"] == pickup_point_id
    assert (body["delivery"]["zone"], body["delivery"]["eta_max_days"]) == (None, 0)


async def test_coupon_minimum_is_reported_in_the_order_currency(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await _preview(
        client, **shipping_body(address, currency="ARS", coupon_code="BIENVENIDA10")
    )

    assert response.status_code == 422
    assert response.json()["code"] == "coupon_min_subtotal"
    assert response.json()["details"] == {"min_subtotal": {"amount": "29000", "currency": "ARS"}}


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"is_active": False}, "coupon_not_found"),
        ({"starts_at": utcnow() + timedelta(days=1)}, "coupon_not_started"),
        (
            {"starts_at": utcnow() - timedelta(days=2), "ends_at": utcnow() - timedelta(seconds=1)},
            "coupon_expired",
        ),
        ({"max_uses": 3, "used_count": 3}, "coupon_exhausted"),
    ],
    ids=["inactive", "not-started", "expired", "exhausted"],
)
async def test_coupon_errors(
    client: AsyncClient,
    session: AsyncSession,
    address: Address,
    change: dict[str, Any],
    code: str,
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)
    await session.execute(update(Coupon).where(Coupon.code == "BIENVENIDA10").values(**change))

    response = await _preview(client, **shipping_body(address, coupon_code="BIENVENIDA10"))

    assert response.status_code == 422
    assert response.json()["code"] == code


async def test_unknown_coupon(client: AsyncClient, session: AsyncSession, address: Address) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)

    response = await _preview(client, **shipping_body(address, coupon_code="NOPE"))

    assert (response.status_code, response.json()["code"]) == (422, "coupon_not_found")


async def test_coupon_per_customer_limit(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)
    other = await make_user(session)
    await _redeem(session, other, "ENVIO5")
    assert (await _preview(client, **shipping_body(address, coupon_code="ENVIO5"))).status_code == 200

    await _redeem(session, customer, "ENVIO5")
    response = await _preview(client, **shipping_body(address, coupon_code="ENVIO5"))

    assert (response.status_code, response.json()["code"]) == (422, "coupon_limit_reached")


@pytest.mark.usefixtures("customer")
async def test_empty_cart_cannot_be_previewed(client: AsyncClient, pickup_point_id: int) -> None:
    response = await _preview(client, **pickup_body(pickup_point_id))

    assert (response.status_code, response.json()["code"]) == (422, "cart_empty")


@pytest.mark.usefixtures("customer")
async def test_cart_with_issues_cannot_be_previewed(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    await add_to_cart(client, session, "TRU-WP-6", 1)
    await session.execute(
        update(ProductVariant).where(ProductVariant.sku == "TRU-WP-6").values(stock=0)
    )

    response = await _preview(client, **pickup_body(pickup_point_id))

    plugs = await session.scalar(select(ProductVariant.id).where(ProductVariant.sku == "TRU-WP-6"))
    assert (response.status_code, response.json()["code"]) == (409, "cart_has_issues")
    assert response.json()["details"] == {"variant_ids": [plugs]}


async def test_resources_must_belong_to_the_customer(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    address: Address,
    pickup_point_id: int,
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    other = await make_user(session)
    foreign_address = await address_for(session, other)
    foreign_profile = await billing_profile(session, other)
    own_profile = await billing_profile(session, customer)

    statuses = [
        (await _preview(client, **body)).status_code
        for body in (
            shipping_body(foreign_address),
            shipping_body(address, billing_profile_id=foreign_profile.id),
            pickup_body(999999),
            shipping_body(address, billing_profile_id=own_profile.id),
        )
    ]

    assert statuses == [404, 404, 404, 200]
    await session.execute(
        update(PickupPoint).where(PickupPoint.id == pickup_point_id).values(is_active=False)
    )
    assert (await _preview(client, **pickup_body(pickup_point_id))).status_code == 404


async def test_inactive_zone_cannot_ship(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    await session.execute(
        update(ShippingZone).where(ShippingZone.code == "amba").values(is_active=False)
    )

    response = await _preview(client, **shipping_body(address))

    assert (response.status_code, response.json()["code"]) == (422, "shipping_unavailable")


@pytest.mark.usefixtures("customer")
@pytest.mark.parametrize(
    "body",
    [
        {"delivery_method": "shipping"},
        {"delivery_method": "shipping", "address_id": 1, "pickup_point_id": 1},
        {"delivery_method": "pickup", "address_id": 1},
        {"delivery_method": "pickup", "pickup_point_id": 1, "coupon_code": "   "},
        {"delivery_method": "pickup", "pickup_point_id": 1, "coupon_code": "X" * 41},
        {"delivery_method": "pickup", "pickup_point_id": 1, "total": "1.00"},
    ],
)
async def test_preview_validates_the_request(client: AsyncClient, body: dict[str, Any]) -> None:
    assert (await client.post(PREVIEW, json=body)).status_code == 422


@pytest.mark.usefixtures("customer")
async def test_coupon_attempts_are_rate_limited(client: AsyncClient, pickup_point_id: int) -> None:
    with_coupon = pickup_body(pickup_point_id, coupon_code="GUESS")
    for _ in range(20):
        assert (await _preview(client, **with_coupon)).json()["code"] == "cart_empty"

    limited = await _preview(client, **with_coupon)
    without_coupon = await _preview(client, **pickup_body(pickup_point_id))

    assert (limited.status_code, limited.json()["code"]) == (429, "rate_limited")
    assert without_coupon.json()["code"] == "cart_empty"
