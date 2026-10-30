from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Address,
    AuditLog,
    Coupon,
    CouponRedemption,
    Order,
    OrderStatus,
    Payment,
    User,
    UserRole,
)
from app.payments.gateway import GatewayError, MockPaymentGateway, PaymentGateway
from tests.conftest import Outbox, RevalidationLog
from tests.factories import make_user
from tests.shopping import (
    PASSWORD,
    add_to_cart,
    address_for,
    count,
    login,
    pickup_body,
    place_order,
    shipping_body,
    stock,
)

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

ORDERS = "/api/v1/admin/orders"
CUSTOMER_ORDERS = "/api/v1/me/orders"
SKU = "STA-SD6"
COUPON = "BIENVENIDA10"


class RefundsFail(MockPaymentGateway):
    async def refund(self, provider_ref: str) -> None:
        raise GatewayError


async def as_admin(client: AsyncClient, session: AsyncSession) -> User:
    admin = await make_user(session, password=PASSWORD, role=UserRole.ADMIN, verified=True)
    await login(client, admin)
    return admin


async def buy(
    client: AsyncClient, session: AsyncSession, body: dict[str, Any], *, locale: str = "es"
) -> str:
    await add_to_cart(client, session, SKU, 2)
    response = await place_order(client, body, locale=locale)
    assert response.json()["status"] == "paid"
    return response.json()["number"]


async def move(client: AsyncClient, number: str, status: str, note: str | None = None) -> Response:
    body = {"status": status} | ({"note": note} if note else {})
    return await client.post(f"{ORDERS}/{number}/status", json=body)


async def walk(client: AsyncClient, number: str, *statuses: str) -> dict[str, Any]:
    for status in statuses:
        response = await move(client, number, status)
        assert response.status_code == 200, response.json()
    return response.json()


async def set_status(session: AsyncSession, number: str, status: OrderStatus) -> None:
    await session.execute(update(Order).where(Order.number == number).values(status=status))


async def audit_rows(session: AsyncSession, number: str) -> list[AuditLog]:
    statement = select(AuditLog).where(AuditLog.entity == "order", AuditLog.entity_id == number)
    return list((await session.scalars(statement)).all())


@pytest.fixture
async def shipping_order(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address
) -> str:
    number = await buy(client, session, shipping_body(address))
    await as_admin(client, session)
    return number


@pytest.fixture
async def pickup_order(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> str:
    number = await buy(client, session, pickup_body(pickup_point_id))
    await as_admin(client, session)
    return number


async def test_a_shipping_order_goes_through_to_delivered(
    client: AsyncClient, shipping_order: str, outbox: Outbox
) -> None:
    number = shipping_order

    preparing = (await move(client, number, "preparing")).json()
    assert preparing["status"] == "preparing"
    assert preparing["next_statuses"] == ["refunded", "shipped"]

    shipped = (await move(client, number, "shipped")).json()
    assert shipped["next_statuses"] == ["delivered"]

    delivered = (await move(client, number, "delivered")).json()
    assert delivered["next_statuses"] == []
    assert [change["to_status"] for change in delivered["status_history"]] == [
        "pending_payment",
        "paid",
        "preparing",
        "shipped",
        "delivered",
    ]
    assert [email.subject for email in outbox.sent("order_preparing")] == [
        f"Estamos preparando tu pedido {number}"
    ]
    [shipped_email] = outbox.sent("order_shipped")
    assert "Envío a" in shipped_email.text
    assert len(outbox.sent("order_delivered")) == 1


async def test_a_pickup_order_goes_through_to_delivered(
    client: AsyncClient, pickup_order: str, outbox: Outbox
) -> None:
    preparing = (await move(client, pickup_order, "preparing")).json()
    assert preparing["next_statuses"] == ["ready_for_pickup", "refunded"]

    order = await walk(client, pickup_order, "ready_for_pickup", "delivered")

    assert order["status"] == "delivered"
    [email] = outbox.sent("order_ready_for_pickup")
    assert "Retiro en" in email.text


async def test_the_history_keeps_who_changed_the_order(
    client: AsyncClient, session: AsyncSession, customer: User, pickup_point_id: int
) -> None:
    number = await buy(client, session, pickup_body(pickup_point_id))
    admin = await as_admin(client, session)

    order = (await move(client, number, "preparing")).json()

    assert [change["changed_by"] for change in order["status_history"]] == [
        customer.id,
        customer.id,
        admin.id,
    ]


async def test_a_shipping_order_cannot_be_ready_for_pickup(
    client: AsyncClient, shipping_order: str
) -> None:
    await walk(client, shipping_order, "preparing")

    response = await move(client, shipping_order, "ready_for_pickup")

    assert (response.status_code, response.json()["code"]) == (409, "invalid_transition")


async def test_a_pickup_order_cannot_be_shipped(client: AsyncClient, pickup_order: str) -> None:
    await walk(client, pickup_order, "preparing")

    response = await move(client, pickup_order, "shipped")

    assert (response.status_code, response.json()["code"]) == (409, "invalid_transition")


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (OrderStatus.PENDING_PAYMENT, "paid"),
        (OrderStatus.PENDING_PAYMENT, "cancelled"),
        (OrderStatus.PENDING_PAYMENT, "preparing"),
        (OrderStatus.PAID, "cancelled"),
        (OrderStatus.PAID, "shipped"),
        (OrderStatus.PAID, "delivered"),
        (OrderStatus.SHIPPED, "refunded"),
        (OrderStatus.DELIVERED, "refunded"),
        (OrderStatus.CANCELLED, "refunded"),
        (OrderStatus.REFUNDED, "refunded"),
    ],
)
async def test_other_transitions_are_rejected(
    client: AsyncClient,
    session: AsyncSession,
    shipping_order: str,
    outbox: Outbox,
    current: OrderStatus,
    target: str,
) -> None:
    await set_status(session, shipping_order, current)
    emails = len(outbox.messages)

    response = await move(client, shipping_order, target)

    assert (response.status_code, response.json()["code"]) == (409, "invalid_transition")
    assert response.json()["details"] == {"from": current, "to": target}
    assert await audit_rows(session, shipping_order) == []
    assert len(outbox.messages) == emails


@pytest.mark.parametrize("steps", [(), ("preparing",)])
async def test_a_refund_restores_stock_and_coupon(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    address: Address,
    outbox: Outbox,
    revalidations: RevalidationLog,
    steps: tuple[str, ...],
) -> None:
    before = await stock(session, SKU)
    number = await buy(client, session, shipping_body(address, coupon_code=COUPON))
    await as_admin(client, session)
    await walk(client, number, *steps) if steps else None
    assert await stock(session, SKU) == before - 2

    response = await move(client, number, "refunded")

    order = response.json()
    assert (response.status_code, order["status"]) == (200, "refunded")
    assert [payment["status"] for payment in order["payments"]] == ["refunded"]
    assert order["next_statuses"] == []
    assert await stock(session, SKU) == before
    used = await session.scalar(select(Coupon.used_count).where(Coupon.code == COUPON))
    assert used == 0
    assert await count(session, CouponRedemption) == 0
    assert revalidations.tags == [["catalog"]]
    [email] = outbox.sent("order_refunded")
    assert email.subject == f"Reintegramos tu pedido {number}"
    assert "Te reintegramos USD" in email.text


async def test_a_failed_refund_changes_nothing(
    client: AsyncClient,
    session: AsyncSession,
    shipping_order: str,
    gateway: PaymentGateway,
    outbox: Outbox,
    revalidations: RevalidationLog,
) -> None:
    left = await stock(session, SKU)
    emails = len(outbox.messages)
    gateway.provider = RefundsFail(slow_seconds=1)

    response = await move(client, shipping_order, "refunded")

    assert (response.status_code, response.json()["code"]) == (503, "payment_unavailable")
    order = await session.scalar(select(Order).where(Order.number == shipping_order))
    assert order is not None
    assert order.status == OrderStatus.PAID
    payment_status = await session.scalar(select(Payment.status).where(Payment.order_id == order.id))
    assert payment_status == "approved"
    assert await stock(session, SKU) == left
    assert await audit_rows(session, shipping_order) == []
    assert len(outbox.messages) == emails
    assert revalidations.tags == []


async def test_only_a_refund_publishes_the_catalog(
    client: AsyncClient, shipping_order: str, revalidations: RevalidationLog
) -> None:
    await walk(client, shipping_order, "preparing", "shipped", "delivered")

    assert revalidations.tags == []


async def test_each_change_is_audited(
    client: AsyncClient, session: AsyncSession, shipping_order: str
) -> None:
    await move(client, shipping_order, "preparing", note="Picked by the warehouse")
    await move(client, shipping_order, "shipped")

    first, second = await audit_rows(session, shipping_order)
    assert first.action == "status_change"
    assert first.changes == {
        "note": {"before": None, "after": "Picked by the warehouse"},
        "status": {"before": "paid", "after": "preparing"},
    }
    assert second.changes == {"status": {"before": "preparing", "after": "shipped"}}


async def test_the_note_stays_with_the_admins(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    pickup_point_id: int,
    outbox: Outbox,
) -> None:
    number = await buy(client, session, pickup_body(pickup_point_id))
    await as_admin(client, session)

    admin_view = (await move(client, number, "preparing", note="Fragile box")).json()

    assert admin_view["status_history"][-1]["note"] == "Fragile box"
    assert "Fragile box" not in outbox.sent("order_preparing")[0].text
    await login(client, customer)
    customer_view = (await client.get(f"{CUSTOMER_ORDERS}/{number}")).json()
    assert customer_view["status_history"][-1]["note"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"status": "unknown"},
        {"status": "preparing", "note": "x" * 501},
        {"status": "preparing", "note": "   "},
        {"status": "preparing", "extra": 1},
        {},
    ],
)
async def test_an_invalid_body_is_rejected(
    client: AsyncClient, shipping_order: str, body: dict[str, Any]
) -> None:
    response = await client.post(f"{ORDERS}/{shipping_order}/status", json=body)

    assert response.status_code == 422


async def test_status_emails_use_the_language_of_the_order(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, outbox: Outbox
) -> None:
    number = await buy(client, session, shipping_body(address), locale="en")
    await as_admin(client, session)

    order = await walk(client, number, "preparing", "shipped", "delivered")

    assert order["locale"] == "en"
    assert outbox.sent("order_preparing")[0].subject == f"We are preparing your order {number}"
    [shipped] = outbox.sent("order_shipped")
    assert shipped.subject == f"Your order {number} is on its way"
    assert "Shipping to" in shipped.text
    assert f"/en/account/orders/{number}" in shipped.text
    assert outbox.sent("order_delivered")[0].subject == f"Your order {number} was delivered"


async def test_detail_shows_the_customer_and_the_next_steps(
    client: AsyncClient, customer: User, shipping_order: str
) -> None:
    response = await client.get(f"{ORDERS}/{shipping_order}")

    order = response.json()
    assert response.status_code == 200
    assert order["customer"] == {
        "id": customer.id,
        "email": customer.email,
        "first_name": customer.first_name,
        "last_name": customer.last_name,
    }
    assert order["locale"] == "es"
    assert order["next_statuses"] == ["preparing", "refunded"]
    assert order["items"][0]["sku"] == SKU
    assert order["payments"][0]["status"] == "approved"


async def test_an_unknown_order_answers_404(client: AsyncClient, session: AsyncSession) -> None:
    await as_admin(client, session)

    assert (await client.get(f"{ORDERS}/TA-2026-999999")).status_code == 404
    assert (await move(client, "TA-2026-999999", "preparing")).status_code == 404


@pytest.fixture
async def two_orders(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    address: Address,
    pickup_point_id: int,
) -> tuple[tuple[str, User], tuple[str, User]]:
    first = await buy(client, session, pickup_body(pickup_point_id))
    other = await make_user(session, password=PASSWORD, verified=True)
    await login(client, other)
    second = await buy(client, session, shipping_body(await address_for(session, other)))
    await as_admin(client, session)
    return (first, customer), (second, other)


async def test_lists_every_customer_newest_first(
    client: AsyncClient, two_orders: tuple[tuple[str, User], tuple[str, User]]
) -> None:
    (first, _), (second, other) = two_orders

    body = (await client.get(ORDERS)).json()

    assert body["total"] == 2
    assert [order["number"] for order in body["items"]] == [second, first]
    newest = body["items"][0]
    assert newest["item_count"] == 2
    assert newest["delivery_method"] == "shipping"
    assert newest["status"] == "paid"
    assert newest["customer"]["email"] == other.email


async def test_filters_the_list(
    client: AsyncClient, two_orders: tuple[tuple[str, User], tuple[str, User]]
) -> None:
    (first, customer), (second, other) = two_orders
    await move(client, first, "preparing")

    async def numbers(**params: str) -> list[str]:
        body = (await client.get(ORDERS, params=params)).json()
        assert body["total"] == len(body["items"])
        return [order["number"] for order in body["items"]]

    assert await numbers(status="preparing") == [first]
    assert await numbers(number=second[-3:]) == [second]
    assert await numbers(email=other.email[:12]) == [second]
    assert await numbers(email=customer.email) == [first]
    assert await numbers(number="%") == []
    now = datetime.now(UTC)
    assert await numbers(date_to=(now - timedelta(days=1)).isoformat()) == []
    assert await numbers(date_from=(now - timedelta(days=1)).isoformat()) == [second, first]
    assert await numbers(date_from=(now + timedelta(days=1)).isoformat()) == []


async def test_pages_the_list(
    client: AsyncClient, two_orders: tuple[tuple[str, User], tuple[str, User]]
) -> None:
    (first, _), _ = two_orders

    body = (await client.get(ORDERS, params={"page": 2, "size": 1})).json()

    assert (body["total"], body["pages"]) == (2, 2)
    assert [order["number"] for order in body["items"]] == [first]


async def test_a_naive_date_is_rejected(client: AsyncClient, session: AsyncSession) -> None:
    await as_admin(client, session)

    response = await client.get(ORDERS, params={"date_from": "2026-10-30T00:00:00"})

    assert response.status_code == 422
