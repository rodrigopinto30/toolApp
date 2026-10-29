import re
import uuid
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import get_payment_gateway
from app.models import (
    Address,
    BillingProfile,
    Coupon,
    CouponRedemption,
    Order,
    Payment,
    PickupPoint,
    ProductVariant,
    Province,
    TaxCondition,
    TaxIdType,
    User,
)
from app.payments.circuit_breaker import CircuitBreaker
from app.payments.gateway import MockPaymentGateway, PaymentGateway
from tests.conftest import Outbox
from tests.factories import build_address, make_user

pytestmark = pytest.mark.usefixtures("seeded")

PASSWORD = "a-long-password"
CHECKOUT = "/api/v1/checkout"
CARD = {"card_number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123", "holder": "Ana Diaz"}
REJECTED_CARD = CARD | {"card_number": "4000 0000 0000 0002"}
SLOW_CARD = CARD | {"card_number": "4000-0000-0009-0003"}


@pytest.fixture
def clock() -> list[float]:
    return [0.0]


@pytest.fixture(autouse=True)
def gateway(app: FastAPI, client: AsyncClient, clock: list[float]) -> PaymentGateway:
    breaker = CircuitBreaker(failure_threshold=3, reset_seconds=30, clock=lambda: clock[0])
    gateway = PaymentGateway(MockPaymentGateway(slow_seconds=1), breaker, timeout_seconds=0.05)
    app.dependency_overrides[get_payment_gateway] = lambda: gateway
    return gateway


@pytest.fixture
async def customer(client: AsyncClient, session: AsyncSession) -> User:
    user = await make_user(session, password=PASSWORD, verified=True)
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return user


@pytest.fixture
async def address(session: AsyncSession, customer: User) -> Address:
    province = (await session.scalars(select(Province).where(Province.code == "AR-C"))).one()
    address = build_address(customer, province, is_default=True)
    session.add(address)
    await session.flush()
    return address


@pytest.fixture
async def pickup_point_id(session: AsyncSession) -> int:
    return await session.scalar(select(PickupPoint.id))


async def _variant_id(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))


async def _stock(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.stock).where(ProductVariant.sku == sku))


async def _count(session: AsyncSession, model: Any, *conditions: Any) -> int:
    return await session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


async def _add(client: AsyncClient, session: AsyncSession, sku: str, quantity: int) -> None:
    variant_id = await _variant_id(session, sku)
    response = await client.put(f"/api/v1/me/cart/items/{variant_id}", json={"quantity": quantity})
    assert response.status_code == 200


async def _cart(client: AsyncClient) -> dict[str, int]:
    cart = (await client.get("/api/v1/me/cart", params={"currency": "USD"})).json()
    return {line["sku"]: line["quantity"] for line in cart["items"]}


def _shipping(address: Address, **body: Any) -> dict[str, Any]:
    return {"delivery_method": "shipping", "address_id": address.id, "currency": "USD"} | body


def _pickup(pickup_point_id: int, **body: Any) -> dict[str, Any]:
    return {"delivery_method": "pickup", "pickup_point_id": pickup_point_id, "currency": "USD"} | body


async def _checkout(
    client: AsyncClient,
    body: dict[str, Any],
    *,
    card: dict[str, str] = CARD,
    key: str | None = None,
    total: dict[str, str] | None = None,
) -> Response:
    if total is None:
        preview = await client.post(f"{CHECKOUT}/preview", json=body)
        assert preview.status_code == 200, preview.json()
        total = preview.json()["total"]
    headers = {"Idempotency-Key": key or uuid.uuid4().hex}
    payload = body | {"expected_total": total, "payment": card}
    return await client.post(CHECKOUT, json=payload, headers=headers)


async def _profile(session: AsyncSession, user: User) -> BillingProfile:
    profile = BillingProfile(
        user_id=user.id,
        tax_id_type=TaxIdType.DNI,
        tax_id="12345678",
        tax_condition=TaxCondition.FINAL_CONSUMER,
        legal_name="Ana Diaz",
        fiscal_address="Calle Falsa 123, CABA",
    )
    session.add(profile)
    await session.flush()
    return profile


async def test_checkout_pays_and_freezes_the_order(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    await _add(client, session, "STA-SD6", 2)
    await _add(client, session, "TRU-WP-6", 1)
    profile = await _profile(session, customer)

    body = _shipping(address, coupon_code="BIENVENIDA10", billing_profile_id=profile.id)
    response = await _checkout(client, body)

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

    assert (await _stock(session, "STA-SD6"), await _stock(session, "TRU-WP-6")) == (48, 199)
    assert await _cart(client) == {}
    used = await session.scalar(select(Coupon.used_count).where(Coupon.code == "BIENVENIDA10"))
    assert used == 1
    assert await _count(session, CouponRedemption, CouponRedemption.user_id == customer.id) == 1
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
    await _add(client, session, "TRU-WP-6", 2)

    body = _pickup(pickup_point_id, currency="ARS", coupon_code="ENVIO5")
    order = (await _checkout(client, body)).json()

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
    await _add(client, session, "STA-SD6", 1)
    body = _pickup(pickup_point_id)
    key = uuid.uuid4().hex

    first = await _checkout(client, body, key=key)
    again = await _checkout(client, body, key=key, total=first.json()["total"])

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["number"] == first.json()["number"]
    assert await _count(session, Order, Order.user_id == customer.id) == 1
    assert await _stock(session, "STA-SD6") == 49


@pytest.mark.usefixtures("customer")
@pytest.mark.parametrize("key", [None, "too-short", "x" * 65, "has spaces in it!!"])
async def test_idempotency_key_is_required_and_validated(
    client: AsyncClient, pickup_point_id: int, key: str | None
) -> None:
    headers = {"Idempotency-Key": key} if key else {}
    payload = _pickup(pickup_point_id) | {
        "expected_total": {"amount": "1.00", "currency": "USD"},
        "payment": CARD,
    }

    response = await client.post(CHECKOUT, json=payload, headers=headers)

    assert response.status_code == 422


async def test_a_changed_total_creates_nothing(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> None:
    await _add(client, session, "STA-SD6", 1)

    response = await _checkout(
        client, _pickup(pickup_point_id), total={"amount": "19.00", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (409, "total_changed")
    assert response.json()["details"]["preview"]["total"] == {"amount": "19.90", "currency": "USD"}
    assert await _count(session, Order, Order.user_id == customer.id) == 0
    assert await _stock(session, "STA-SD6") == 50
    assert await _cart(client) == {"STA-SD6": 1}


@pytest.mark.usefixtures("customer")
async def test_expected_total_must_use_the_order_currency(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await _add(client, session, "STA-SD6", 1)

    response = await _checkout(
        client, _pickup(pickup_point_id), total={"amount": "19.90", "currency": "ARS"}
    )

    assert response.status_code == 422


@pytest.mark.usefixtures("customer")
async def test_stock_changes_are_checked_after_locking(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await _add(client, session, "BOS-HD18-18V", 10)
    total = {"amount": "1890.00", "currency": "USD"}
    await session.execute(
        update(ProductVariant).where(ProductVariant.sku == "BOS-HD18-18V").values(stock=4)
    )

    response = await _checkout(client, _pickup(pickup_point_id), total=total)

    drill = await _variant_id(session, "BOS-HD18-18V")
    assert (response.status_code, response.json()["code"]) == (409, "insufficient_stock")
    assert response.json()["details"] == {"items": [{"variant_id": drill, "available": 4}]}


@pytest.mark.usefixtures("customer")
async def test_unavailable_lines_block_the_checkout(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await _add(client, session, "TRU-WP-6", 1)
    await session.execute(
        update(ProductVariant).where(ProductVariant.sku == "TRU-WP-6").values(is_active=False)
    )

    response = await _checkout(
        client, _pickup(pickup_point_id), total={"amount": "3.50", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (409, "cart_has_issues")


async def test_checkout_requires_a_verified_email(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    user = await make_user(session, password=PASSWORD)
    await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})

    response = await _checkout(
        client, _pickup(pickup_point_id), total={"amount": "1.00", "currency": "USD"}
    )

    assert (response.status_code, response.json()["code"]) == (403, "email_not_verified")


async def test_a_rejected_payment_cancels_the_order_and_restores_everything(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    await _add(client, session, "BOS-HD18-18V", 1)
    await _add(client, session, "TRU-WP-6", 3)

    body = _shipping(address, coupon_code="BIENVENIDA10")
    response = await _checkout(client, body, card=REJECTED_CARD)

    assert (response.status_code, response.json()["code"]) == (402, "payment_rejected")
    number = response.json()["details"]["order_number"]
    status, cancelled_at = (
        await session.execute(select(Order.status, Order.cancelled_at).where(Order.number == number))
    ).one()
    assert status == "cancelled" and cancelled_at is not None
    payment = await session.scalar(select(Payment.raw_response))
    assert payment == {"status": "rejected", "brand": "visa", "last4": "0002"}
    assert (await _stock(session, "BOS-HD18-18V"), await _stock(session, "TRU-WP-6")) == (15, 200)
    used = await session.scalar(select(Coupon.used_count).where(Coupon.code == "BIENVENIDA10"))
    assert used == 0
    assert await _count(session, CouponRedemption) == 0
    assert await _cart(client) == {"BOS-HD18-18V": 1, "TRU-WP-6": 3}
    [email] = outbox.sent("payment_rejected")
    assert number in email.subject
    assert outbox.sent("order_confirmed") == []


async def test_a_payment_timeout_leaves_the_order_pending(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int, outbox: Outbox
) -> None:
    await _add(client, session, "STA-SD6", 1)

    response = await _checkout(client, _pickup(pickup_point_id), card=SLOW_CARD)

    order = response.json()
    assert response.status_code == 202
    assert order["status"] == "pending_payment"
    assert [(p["status"], p["last4"]) for p in order["payments"]] == [("pending", None)]
    assert await _stock(session, "STA-SD6") == 49
    assert await _cart(client) == {}
    assert outbox.sent("order_confirmed") == outbox.sent("payment_rejected") == []


async def test_the_breaker_stops_checkouts_until_it_resets(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    pickup_point_id: int,
    clock: list[float],
) -> None:
    body = _pickup(pickup_point_id)
    for _ in range(3):
        await _add(client, session, "TRU-WP-6", 1)
        assert (await _checkout(client, body, card=SLOW_CARD)).status_code == 202
    await _add(client, session, "TRU-WP-6", 1)

    blocked = await _checkout(client, body)

    assert (blocked.status_code, blocked.json()["code"]) == (503, "payment_unavailable")
    assert await _count(session, Order, Order.user_id == customer.id) == 3
    assert await _cart(client) == {"TRU-WP-6": 1}

    clock[0] = 30
    assert (await _checkout(client, body)).status_code == 201


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
    await _add(client, session, "STA-SD6", 1)

    response = await _checkout(
        client, _pickup(pickup_point_id), card=card, total={"amount": "19.90", "currency": "USD"}
    )

    assert response.status_code == 422
    assert "4242" not in response.text


@pytest.mark.usefixtures("customer")
async def test_checkouts_are_rate_limited(client: AsyncClient, pickup_point_id: int) -> None:
    total = {"amount": "1.00", "currency": "USD"}
    for _ in range(10):
        response = await _checkout(client, _pickup(pickup_point_id), total=total)
        assert response.json()["code"] == "cart_empty"

    limited = await _checkout(client, _pickup(pickup_point_id), total=total)

    assert (limited.status_code, limited.json()["code"]) == (429, "rate_limited")
