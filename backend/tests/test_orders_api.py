import uuid
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Address,
    Coupon,
    CouponRedemption,
    Currency,
    DeliveryMethod,
    Order,
    OrderStatus,
    Payment,
    User,
)
from app.payments.cards import Card
from app.payments.gateway import ChargeResult, GatewayError, MockPaymentGateway, PaymentGateway
from app.schemas.common import Money
from tests.conftest import Outbox
from tests.factories import make_user
from tests.shopping import (
    CARD,
    REJECTED_CARD,
    SLOW_CARD,
    add_to_cart,
    cart_quantities,
    count,
    pickup_body,
    place_order,
    shipping_body,
    stock,
)

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

ORDERS = "/api/v1/me/orders"


class RefundsFail(MockPaymentGateway):
    async def refund(self, provider_ref: str) -> None:
        raise GatewayError


class CancelledDuringCharge(MockPaymentGateway):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(slow_seconds=1)
        self.session = session
        self.refunds: list[str] = []

    async def charge(self, amount: Money, card: Card) -> ChargeResult:
        await self.session.execute(update(Order).values(status=OrderStatus.CANCELLED))
        return await super().charge(amount, card)

    async def refund(self, provider_ref: str) -> None:
        self.refunds.append(provider_ref)


async def _pay(
    client: AsyncClient, number: str, card: dict[str, str] = CARD, key: str | None = None
) -> Response:
    headers = {"Idempotency-Key": key or uuid.uuid4().hex}
    return await client.post(f"{ORDERS}/{number}/pay", json={"payment": card}, headers=headers)


async def _pending_order(client: AsyncClient, body: dict[str, Any]) -> str:
    response = await place_order(client, body, card=SLOW_CARD)
    assert response.status_code == 202
    return response.json()["number"]


async def _coupon_uses(session: AsyncSession, code: str) -> int:
    return await session.scalar(select(Coupon.used_count).where(Coupon.code == code))


async def _payment_statuses(session: AsyncSession, number: str) -> list[str]:
    statement = (
        select(Payment.status).join(Order).where(Order.number == number).order_by(Payment.id)
    )
    return list(await session.scalars(statement))


async def test_orders_require_a_session(raw_client: AsyncClient) -> None:
    assert (await raw_client.get(ORDERS)).status_code == 401


async def test_orders_are_listed_newest_first(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> None:
    numbers = []
    for quantity, currency in ((1, "USD"), (3, "ARS"), (2, "USD")):
        await add_to_cart(client, session, "TRU-WP-6", quantity)
        body = pickup_body(pickup_point_id, currency=currency)
        numbers.append((await place_order(client, body)).json()["number"])
    other = await make_user(session)
    session.add(
        Order(
            number="TA-2026-OTHER1",
            user_id=other.id,
            currency=Currency.USD,
            exchange_rate=Decimal("1450"),
            subtotal=Decimal("1.00"),
            discount_total=Decimal("0.00"),
            shipping_total=Decimal("0.00"),
            total=Decimal("1.00"),
            delivery_method=DeliveryMethod.PICKUP,
        )
    )
    await session.flush()

    first = (await client.get(ORDERS, params={"size": 2})).json()
    second = (await client.get(ORDERS, params={"size": 2, "page": 2})).json()

    assert (first["total"], first["pages"], first["page"], first["size"]) == (3, 2, 1, 2)
    assert [order["number"] for order in first["items"] + second["items"]] == numbers[::-1]
    assert [
        (order["status"], order["item_count"], order["total"]) for order in first["items"]
    ] == [
        ("paid", 2, {"amount": "7.00", "currency": "USD"}),
        ("paid", 3, {"amount": "15225", "currency": "ARS"}),
    ]


@pytest.mark.parametrize("params", [{"size": 0}, {"size": 51}, {"page": 0}])
@pytest.mark.usefixtures("customer")
async def test_order_list_validates_paging(client: AsyncClient, params: dict[str, int]) -> None:
    assert (await client.get(ORDERS, params=params)).status_code == 422


async def test_order_detail_is_scoped_to_the_owner(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    placed = (await place_order(client, shipping_body(address))).json()

    detail = await client.get(f"{ORDERS}/{placed['number']}")

    assert detail.status_code == 200
    assert detail.json() == placed
    other = await make_user(session, password="a-long-password", verified=True)
    await client.post(
        "/api/v1/auth/login", json={"email": other.email, "password": "a-long-password"}
    )
    assert (await client.get(f"{ORDERS}/{placed['number']}")).status_code == 404
    assert (await client.get(f"{ORDERS}/TA-2026-999999")).status_code == 404


async def test_cancel_a_pending_order_releases_stock_and_coupon(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "BOS-HD18-18V", 1)
    body = shipping_body(address, coupon_code="BIENVENIDA10")
    number = await _pending_order(client, body)
    assert await stock(session, "BOS-HD18-18V") == 14
    assert await _coupon_uses(session, "BIENVENIDA10") == 1

    response = await client.post(f"{ORDERS}/{number}/cancel")

    order = response.json()
    assert response.status_code == 200
    assert (order["status"], order["cancelled_at"] is not None) == ("cancelled", True)
    last = order["status_history"][-1]
    assert (last["from_status"], last["to_status"], last["note"]) == (
        "pending_payment",
        "cancelled",
        "cancelled_by_customer",
    )
    assert await stock(session, "BOS-HD18-18V") == 15
    assert await _coupon_uses(session, "BIENVENIDA10") == 0
    assert await count(session, CouponRedemption) == 0
    assert await cart_quantities(client) == {}
    [email] = outbox.sent("order_cancelled")
    assert number in email.subject
    assert "reintegramos" not in email.text


async def test_cancel_a_paid_order_refunds_it(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 2)
    number = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]

    order = (await client.post(f"{ORDERS}/{number}/cancel")).json()

    assert order["status"] == "cancelled"
    assert [payment["status"] for payment in order["payments"]] == ["refunded"]
    assert await stock(session, "STA-SD6") == 50
    [email] = outbox.sent("order_cancelled")
    assert "Te reintegramos USD 39,80 en el mismo medio de pago." in email.text


@pytest.mark.usefixtures("customer")
async def test_the_cancel_email_uses_the_language_of_the_order(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    response = await place_order(client, pickup_body(pickup_point_id), locale="en")
    number = response.json()["number"]

    await client.post(f"{ORDERS}/{number}/cancel", params={"locale": "es"})

    [email] = outbox.sent("order_cancelled")
    assert email.subject == f"Your order {number} was cancelled"


@pytest.mark.parametrize("status", [OrderStatus.PREPARING, OrderStatus.CANCELLED])
@pytest.mark.usefixtures("customer")
async def test_cancel_is_only_allowed_before_preparing(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, status: OrderStatus
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    number = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]
    await session.execute(update(Order).where(Order.number == number).values(status=status))

    response = await client.post(f"{ORDERS}/{number}/cancel")

    assert (response.status_code, response.json()["code"]) == (409, "invalid_transition")
    assert await stock(session, "STA-SD6") == 49


@pytest.mark.usefixtures("customer")
async def test_a_failed_refund_changes_nothing(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, gateway: PaymentGateway
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    number = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]
    gateway.provider = RefundsFail(slow_seconds=1)

    response = await client.post(f"{ORDERS}/{number}/cancel")

    assert (response.status_code, response.json()["code"]) == (503, "payment_unavailable")
    status = await session.scalar(select(Order.status).where(Order.number == number))
    assert (status, await _payment_statuses(session, number)) == ("paid", ["approved"])
    assert await stock(session, "STA-SD6") == 49


@pytest.mark.usefixtures("customer")
async def test_pay_a_pending_order(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    number = await _pending_order(client, pickup_body(pickup_point_id))
    key = uuid.uuid4().hex

    first = await _pay(client, number, key=key)
    again = await _pay(client, number, key=key)

    assert (first.status_code, first.json()["status"]) == (200, "paid")
    assert again.status_code == 200 and again.json() == first.json()
    assert [(p["status"], p["last4"]) for p in first.json()["payments"]] == [
        ("pending", None),
        ("approved", "4242"),
    ]
    assert await _payment_statuses(session, number) == ["pending", "approved"]
    [email] = outbox.sent("order_confirmed")
    assert number in email.subject


@pytest.mark.usefixtures("customer")
async def test_a_rejected_retry_cancels_the_order_and_restores_the_cart(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int, outbox: Outbox
) -> None:
    await add_to_cart(client, session, "STA-SD6", 2)
    number = await _pending_order(client, pickup_body(pickup_point_id))

    response = await _pay(client, number, REJECTED_CARD)

    assert (response.status_code, response.json()["details"]) == (402, {"order_number": number})
    assert await session.scalar(select(Order.status).where(Order.number == number)) == "cancelled"
    assert await stock(session, "STA-SD6") == 50
    assert await cart_quantities(client) == {"STA-SD6": 2}
    assert len(outbox.sent("payment_rejected")) == 1


@pytest.mark.usefixtures("customer")
async def test_only_pending_orders_can_be_paid(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, "STA-SD6", 1)
    number = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]

    paid = await _pay(client, number)
    unknown = await _pay(client, "TA-2026-999999")

    assert (paid.status_code, paid.json()["code"]) == (409, "invalid_transition")
    assert unknown.status_code == 404


@pytest.mark.usefixtures("customer")
async def test_pay_attempts_are_limited_per_order(client: AsyncClient) -> None:
    for _ in range(5):
        assert (await _pay(client, "TA-2026-999999")).status_code == 404

    limited = await _pay(client, "TA-2026-999999")

    assert (limited.status_code, limited.json()["code"]) == (429, "rate_limited")


@pytest.mark.usefixtures("customer")
async def test_pay_needs_the_gateway_and_an_idempotency_key(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    for _ in range(3):
        await add_to_cart(client, session, "TRU-WP-6", 1)
        number = await _pending_order(client, pickup_body(pickup_point_id))

    blocked = await _pay(client, number)
    without_key = await client.post(f"{ORDERS}/{number}/pay", json={"payment": CARD})

    assert (blocked.status_code, blocked.json()["code"]) == (503, "payment_unavailable")
    assert await _payment_statuses(session, number) == ["pending"]
    assert without_key.status_code == 422


@pytest.mark.usefixtures("customer")
async def test_an_approval_after_a_cancel_is_refunded(
    client: AsyncClient,
    session: AsyncSession,
    pickup_point_id: int,
    gateway: PaymentGateway,
    outbox: Outbox,
) -> None:
    provider = CancelledDuringCharge(session)
    gateway.provider = provider
    await add_to_cart(client, session, "STA-SD6", 1)

    response = await place_order(client, pickup_body(pickup_point_id))

    assert (response.status_code, response.json()["status"]) == (200, "cancelled")
    assert [p["status"] for p in response.json()["payments"]] == ["refunded"]
    assert len(provider.refunds) == 1
    assert outbox.sent("order_confirmed") == []
