import re
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Address,
    Coupon,
    CouponRedemption,
    Order,
    Payment,
    ProductVariant,
    User,
)
from tests.conftest import Outbox
from tests.factories import make_user
from tests.shopping import (
    CARD,
    CHECKOUT,
    PASSWORD,
    REJECTED_CARD,
    SLOW_CARD,
    add_to_cart,
    billing_profile,
    cart_quantities,
    count,
    pickup_body,
    place_order,
    shipping_body,
    stock,
    variant_id,
)

pytestmark = pytest.mark.usefixtures("seeded", "gateway")


async def test_checkout_pays_and_freezes_the_order(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 2)
    await add_to_cart(client, session, "TRU-WP-6", 1)
    profile = await billing_profile(session, customer)

    body = shipping_body(address, coupon_code="BIENVENIDA10", billing_profile_id=profile.id)
    response = await place_order(client, body)

    order = response.json()
    assert response.status_code == 201
    assert re.fullmatch(r"TA-\d{4}-\d{6}", order["number"])
    assert (order["status"], order["currency"]) == ("paid", "USD")
    assert order["paid_at"] is not None
    assert [
        (i["sku"], i["product_name"], i["variant_label"], i["quantity"], i["line_total"]["amount"])
        for i in order["items"]
    ] == [
        ("STA-SD6", "Juego de destornilladores 6 piezas", None, 2, "39.80"),
        ("TRU-WP-6", "Tarugos de nylon (100 u.)", "6 mm", 1, "3.50"),
    ]
    keys = ("subtotal", "discount_total", "shipping_total", "total")
    assert [order[key]["amount"] for key in keys] == ["43.30", "4.33", "8.00", "46.97"]
    assert order["coupon"] == {"code": "BIENVENIDA10", "type": "percent"}
    delivery = order["delivery"]
    assert delivery["address"]["street"] == "Calle Falsa"
    assert delivery["address"]["province"] == {
        "code": "AR-C",
        "name": "Ciudad Autónoma de Buenos Aires",
    }
    assert (delivery["zone"]["code"], delivery["pickup_point"]) == ("amba", None)
    assert order["billing"]["tax_id"] == "12345678"
    assert [(c["from_status"], c["to_status"]) for c in order["status_history"]] == [
        (None, "pending_payment"),
        ("pending_payment", "paid"),
    ]
    assert [
        (p["status"], p["amount"]["amount"], p["brand"], p["last4"]) for p in order["payments"]
    ] == [("approved", "46.97", "visa", "4242")]

    assert (await stock(session, "STA-SD6"), await stock(session, "TRU-WP-6")) == (48, 199)
    assert await cart_quantities(client) == {}
    used = await session.scalar(select(Coupon.used_count).where(Coupon.code == "BIENVENIDA10"))
    assert used == 1
    assert await count(session, CouponRedemption, CouponRedemption.user_id == customer.id) == 1
    raw = await session.scalar(select(Payment.raw_response))
    assert raw == {"status": "approved", "brand": "visa", "last4": "4242"}

    [email] = outbox.sent("order_confirmed")
    assert email.to == customer.email
    assert order["number"] in email.subject
    assert "Total: USD 46,97" in email.text
    assert "Calle Falsa 123" in email.text


@pytest.mark.usefixtures("customer")
async def test_checkout_with_pickup_in_ars(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "TRU-WP-6", 2)

    body = pickup_body(pickup_point_id, currency="ARS", coupon_code="ENVIO5")
    order = (await place_order(client, body)).json()

    assert [order[k]["amount"] for k in ("subtotal", "discount_total", "total")] == [
        "10150",
        "7250",
        "2900",
    ]
    assert Decimal(order["exchange_rate"]) == Decimal("1450")
    assert order["delivery"]["pickup_point"]["id"] == pickup_point_id
    assert (order["delivery"]["address"], order["delivery"]["zone"], order["billing"]) == (
        None,
        None,
        None,
    )


async def test_the_same_idempotency_key_returns_the_same_order(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    body = pickup_body(pickup_point_id)
    key = uuid.uuid4().hex

    first = await place_order(client, body, key=key)
    again = await place_order(client, body, key=key, total=first.json()["total"])

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["number"] == first.json()["number"]
    assert await count(session, Order, Order.user_id == customer.id) == 1
    assert await stock(session, "STA-SD6") == 49


@pytest.mark.usefixtures("customer")
@pytest.mark.parametrize("key", [None, "too-short", "x" * 65, "has spaces in it!!"])
async def test_idempotency_key_is_required_and_validated(
    client: AsyncClient, pickup_point_id: int, key: str | None
) -> None:
    headers = {"Idempotency-Key": key} if key else {}
    payload = pickup_body(pickup_point_id) | {
        "expected_total": {"amount": "1.00", "currency": "USD"},
        "payment": CARD,
    }

    response = await client.post(CHECKOUT, json=payload, headers=headers)

    assert response.status_code == 422


async def test_a_changed_total_creates_nothing(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await place_order(
        client, pickup_body(pickup_point_id), total={"amount": "19.00", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (409, "total_changed")
    assert response.json()["details"]["preview"]["total"] == {"amount": "19.90", "currency": "USD"}
    assert await count(session, Order, Order.user_id == customer.id) == 0
    assert await stock(session, "STA-SD6") == 50
    assert await cart_quantities(client) == {"STA-SD6": 1}


@pytest.mark.usefixtures("customer")
async def test_expected_total_must_use_the_order_currency(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await place_order(
        client, pickup_body(pickup_point_id), total={"amount": "19.90", "currency": "ARS"}
    )

    assert response.status_code == 422


@pytest.mark.usefixtures("customer")
async def test_stock_changes_are_checked_after_locking(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 10)
    total = {"amount": "1890.00", "currency": "USD"}
    await session.execute(
        update(ProductVariant).where(ProductVariant.sku == "BOS-HD18-18V").values(stock=4)
    )

    response = await place_order(client, pickup_body(pickup_point_id), total=total)

    drill = await variant_id(session, "BOS-HD18-18V")
    assert (response.status_code, response.json()["code"]) == (409, "insufficient_stock")
    assert response.json()["details"] == {"items": [{"variant_id": drill, "available": 4}]}


@pytest.mark.usefixtures("customer")
async def test_unavailable_lines_block_the_checkout(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "TRU-WP-6", 1)
    await session.execute(
        update(ProductVariant).where(ProductVariant.sku == "TRU-WP-6").values(is_active=False)
    )

    response = await place_order(
        client, pickup_body(pickup_point_id), total={"amount": "3.50", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (409, "cart_has_issues")


async def test_checkout_requires_a_verified_email(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    user = await make_user(session, password=PASSWORD)
    await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})

    response = await place_order(
        client, pickup_body(pickup_point_id), total={"amount": "1.00", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (403, "email_not_verified")


async def test_a_rejected_payment_cancels_the_order_and_restores_everything(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)
    await add_to_cart(client, session, "TRU-WP-6", 3)

    body = shipping_body(address, coupon_code="BIENVENIDA10")
    response = await place_order(client, body, card=REJECTED_CARD)

    assert (response.status_code, response.json()["code"]) == (402, "payment_rejected")
    number = response.json()["details"]["order_number"]
    status, cancelled_at = (
        await session.execute(select(Order.status, Order.cancelled_at).where(Order.number == number))
    ).one()
    assert status == "cancelled" and cancelled_at is not None
    payment = await session.scalar(select(Payment.raw_response))
    assert payment == {"status": "rejected", "brand": "visa", "last4": "0002"}
    assert (await stock(session, "BOS-HD18-18V"), await stock(session, "TRU-WP-6")) == (15, 200)
    used = await session.scalar(select(Coupon.used_count).where(Coupon.code == "BIENVENIDA10"))
    assert used == 0
    assert await count(session, CouponRedemption) == 0
    assert await cart_quantities(client) == {"BOS-HD18-18V": 1, "TRU-WP-6": 3}
    [email] = outbox.sent("payment_rejected")
    assert number in email.subject
    assert outbox.sent("order_confirmed") == []


async def test_a_payment_timeout_leaves_the_order_pending(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await place_order(client, pickup_body(pickup_point_id), card=SLOW_CARD)

    order = response.json()
    assert response.status_code == 202
    assert order["status"] == "pending_payment"
    assert [(p["status"], p["last4"]) for p in order["payments"]] == [("pending", None)]
    assert await stock(session, "STA-SD6") == 49
    assert await cart_quantities(client) == {}
    assert outbox.sent("order_confirmed") == outbox.sent("payment_rejected") == []


async def test_the_breaker_stops_checkouts_until_it_resets(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    pickup_point_id: int,
    payment_clock: list[float],
) -> None:
    body = pickup_body(pickup_point_id)
    for _ in range(3):
        await add_to_cart(client, session, "TRU-WP-6", 1)
        assert (await place_order(client, body, card=SLOW_CARD)).status_code == 202
    await add_to_cart(client, session, "TRU-WP-6", 1)

    blocked = await place_order(client, body)

    assert (blocked.status_code, blocked.json()["code"]) == (503, "payment_unavailable")
    assert await count(session, Order, Order.user_id == customer.id) == 3
    assert await cart_quantities(client) == {"TRU-WP-6": 1}

    payment_clock[0] = 30
    assert (await place_order(client, body)).status_code == 201


@pytest.mark.usefixtures("customer")
@pytest.mark.parametrize(
    "card",
    [
        CARD | {"card_number": "4242 4242 4242 4241"},
        CARD | {"expiry": "01/20"},
        CARD | {"expiry": "13/30"},
        CARD | {"cvc": "12"},
        CARD | {"holder": "  "},
    ],
    ids=["luhn", "expired", "month", "cvc", "holder"],
)
async def test_card_data_is_validated_and_never_echoed(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, card: dict[str, str]
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await place_order(
        client, pickup_body(pickup_point_id), card=card, total={"amount": "19.90", "currency": "USD"}
    )

    assert response.status_code == 422
    assert "4242" not in response.text


@pytest.mark.usefixtures("customer")
async def test_checkouts_are_rate_limited(client: AsyncClient, pickup_point_id: int) -> None:
    total = {"amount": "1.00", "currency": "USD"}
    for _ in range(10):
        response = await place_order(client, pickup_body(pickup_point_id), total=total)
        assert response.json()["code"] == "cart_empty"

    limited = await place_order(client, pickup_body(pickup_point_id), total=total)

    assert (limited.status_code, limited.json()["code"]) == (429, "rate_limited")
