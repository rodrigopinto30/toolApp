import asyncio
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
import structlog
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.cache.decorators import Cache
from app.core.config import Settings
from app.db.repositories.purchase import OrderRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.jobs.expire_orders import run_cycles
from app.models import Address, AuditLog, Coupon, Order, OrderStatus, OrderStatusHistory
from app.payments.cards import Card
from app.payments.gateway import ChargeResult, MockPaymentGateway, PaymentGateway
from app.schemas.common import Money
from app.services import order_expiry
from app.services.order_expiry import OrderExpiry
from app.services.revalidation import ChangePublisher
from tests.conftest import Outbox, RevalidationLog
from tests.shopping import (
    CARD,
    SLOW_CARD,
    add_to_cart,
    pickup_body,
    place_order,
    shipping_body,
    stock,
)

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

ORDERS = "/api/v1/me/orders"
TTL_MINUTES = 30
SKU = "STA-SD6"


@pytest.fixture
def expiry(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    outbox: Outbox,
    cache: Cache,
    revalidations: RevalidationLog,
) -> OrderExpiry:
    return OrderExpiry(
        SqlAlchemyUnitOfWork(session_factory),
        Mailer(settings, outbox.messages.append),
        ChangePublisher(cache, revalidations),
        TTL_MINUTES,
    )


async def _pending_order(
    client: AsyncClient, session: AsyncSession, body: dict[str, Any], locale: str = "es"
) -> str:
    await add_to_cart(client, session, SKU, 2)
    response = await place_order(client, body, card=SLOW_CARD, locale=locale)
    assert response.status_code == 202
    return response.json()["number"]


async def _age(session: AsyncSession, number: str, minutes: float) -> None:
    await session.execute(
        update(Order)
        .where(Order.number == number)
        .values(created_at=utcnow() - timedelta(minutes=minutes))
    )


async def _status(client: AsyncClient, number: str) -> str:
    return (await client.get(f"{ORDERS}/{number}")).json()["status"]


async def _coupon_uses(session: AsyncSession, code: str) -> int:
    used = await session.scalar(
        select(Coupon.used_count)
        .where(Coupon.code == code)
        .execution_options(populate_existing=True)
    )
    assert used is not None
    return used


@pytest.mark.usefixtures("customer")
async def test_cancels_an_overdue_order_and_tells_the_customer(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    address: Address,
    outbox: Outbox,
    revalidations: RevalidationLog,
) -> None:
    available = await stock(session, SKU)
    body = shipping_body(address, coupon_code="BIENVENIDA10")
    number = await _pending_order(client, session, body)
    await _age(session, number, TTL_MINUTES + 1)

    assert await expiry.run() == 1

    order = (await client.get(f"{ORDERS}/{number}")).json()
    assert order["status"] == "cancelled"
    assert order["cancelled_at"] is not None
    assert order["status_history"][-1]["from_status"] == "pending_payment"
    assert order["status_history"][-1]["note"] == "expired"
    assert await stock(session, SKU) == available
    assert await _coupon_uses(session, "BIENVENIDA10") == 0
    [email] = outbox.sent("order_expired")
    assert number in email.subject
    assert f"/account/orders/{number}" in email.text
    assert revalidations.tags == [["catalog"]]


@pytest.mark.usefixtures("customer")
async def test_the_change_has_no_actor(
    client: AsyncClient, session: AsyncSession, expiry: OrderExpiry, pickup_point_id: int
) -> None:
    number = await _pending_order(client, session, pickup_body(pickup_point_id))
    await _age(session, number, TTL_MINUTES + 1)

    await expiry.run()

    log = await session.scalar(select(AuditLog).where(AuditLog.entity_id == number))
    assert log is not None
    assert (log.actor_id, log.ip, log.action) == (None, None, "status_change")
    assert log.changes == {
        "note": {"before": None, "after": "expired"},
        "status": {"before": "pending_payment", "after": "cancelled"},
    }
    history = await session.scalar(
        select(OrderStatusHistory).where(OrderStatusHistory.note == "expired")
    )
    assert history is not None
    assert history.changed_by is None


@pytest.mark.usefixtures("customer")
async def test_the_email_follows_the_order_language(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    pickup_point_id: int,
    outbox: Outbox,
) -> None:
    number = await _pending_order(client, session, pickup_body(pickup_point_id), "en")
    await _age(session, number, TTL_MINUTES + 1)

    await expiry.run()

    [email] = outbox.sent("order_expired")
    assert email.subject == f"Your order {number} expired"
    assert "/en/account/orders/" in email.text


@pytest.mark.usefixtures("customer")
async def test_a_recent_order_keeps_waiting(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    pickup_point_id: int,
    outbox: Outbox,
    revalidations: RevalidationLog,
) -> None:
    number = await _pending_order(client, session, pickup_body(pickup_point_id))
    await _age(session, number, TTL_MINUTES - 1)

    assert await expiry.run() == 0

    assert await _status(client, number) == "pending_payment"
    assert outbox.sent("order_expired") == []
    assert revalidations.tags == []


@pytest.mark.usefixtures("customer")
async def test_only_pending_orders_expire(
    client: AsyncClient, session: AsyncSession, expiry: OrderExpiry, pickup_point_id: int
) -> None:
    await add_to_cart(client, session, SKU, 1)
    paid = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]
    await _age(session, paid, TTL_MINUTES + 1)

    assert await expiry.run() == 0

    assert await _status(client, paid) == "paid"


@pytest.mark.usefixtures("customer")
async def test_skips_an_order_that_changed_after_the_listing(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    pickup_point_id: int,
    outbox: Outbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await add_to_cart(client, session, SKU, 1)
    paid = (await place_order(client, pickup_body(pickup_point_id))).json()["number"]
    paid_id = await session.scalar(select(Order.id).where(Order.number == paid))

    async def stale_listing(*_: Any, **__: Any) -> Sequence[int]:
        return [paid_id, 999_999_999]

    monkeypatch.setattr(OrderRepository, "overdue_ids", stale_listing)

    assert await expiry.run() == 0

    assert await _status(client, paid) == "paid"
    assert outbox.sent("order_expired") == []


@pytest.mark.usefixtures("customer")
async def test_one_failure_does_not_block_the_rest(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    pickup_point_id: int,
    outbox: Outbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = pickup_body(pickup_point_id)
    failing = await _pending_order(client, session, body)
    working = await _pending_order(client, session, body)
    await _age(session, failing, TTL_MINUTES + 2)
    await _age(session, working, TTL_MINUTES + 1)
    release = order_expiry.release_order

    async def release_or_fail(session: AsyncSession, order: Order) -> None:
        if order.number == failing:
            raise RuntimeError("boom")
        await release(session, order)

    monkeypatch.setattr(order_expiry, "release_order", release_or_fail)

    with structlog.testing.capture_logs() as logs:
        assert await expiry.run() == 1

    assert await _status(client, failing) == "pending_payment"
    assert await _status(client, working) == "cancelled"
    assert any(log["event"] == "order_expiry_failed" for log in logs)
    assert len(outbox.sent("order_expired")) == 1

    monkeypatch.setattr(order_expiry, "release_order", release)
    assert await expiry.run() == 1
    assert await _status(client, failing) == "cancelled"


@pytest.mark.usefixtures("customer")
async def test_lists_the_oldest_orders_first(
    client: AsyncClient, session: AsyncSession, pickup_point_id: int
) -> None:
    body = pickup_body(pickup_point_id)
    newer = await _pending_order(client, session, body)
    older = await _pending_order(client, session, body)
    await _age(session, newer, TTL_MINUTES + 1)
    await _age(session, older, TTL_MINUTES + 2)
    cutoff: datetime = utcnow() - timedelta(minutes=TTL_MINUTES)

    [order_id] = await OrderRepository(session).overdue_ids(cutoff, limit=1)

    assert order_id == await session.scalar(select(Order.id).where(Order.number == older))


class ExpiredDuringCharge(MockPaymentGateway):
    def __init__(self, expiry: OrderExpiry) -> None:
        super().__init__(slow_seconds=1)
        self.expiry = expiry
        self.refunds: list[str] = []

    async def charge(self, amount: Money, card: Card) -> ChargeResult:
        await self.expiry.run()
        return await super().charge(amount, card)

    async def refund(self, provider_ref: str) -> None:
        self.refunds.append(provider_ref)


@pytest.mark.usefixtures("customer")
async def test_a_payment_that_lands_after_the_expiry_is_refunded(
    client: AsyncClient,
    session: AsyncSession,
    expiry: OrderExpiry,
    pickup_point_id: int,
    gateway: PaymentGateway,
    outbox: Outbox,
) -> None:
    number = await _pending_order(client, session, pickup_body(pickup_point_id))
    await _age(session, number, TTL_MINUTES + 1)
    provider = ExpiredDuringCharge(expiry)
    gateway.provider = provider

    response = await client.post(
        f"{ORDERS}/{number}/pay", json={"payment": CARD}, headers={"Idempotency-Key": uuid.uuid4().hex}
    )

    assert (response.status_code, response.json()["status"]) == (200, "cancelled")
    assert [payment["status"] for payment in response.json()["payments"]] == [
        "pending",
        "refunded",
    ]
    assert len(provider.refunds) == 1
    assert outbox.sent("order_confirmed") == []


@pytest.mark.usefixtures("customer")
async def test_an_expired_order_cannot_be_paid_or_cancelled(
    client: AsyncClient, session: AsyncSession, expiry: OrderExpiry, pickup_point_id: int
) -> None:
    number = await _pending_order(client, session, pickup_body(pickup_point_id))
    await _age(session, number, TTL_MINUTES + 1)
    await expiry.run()

    paid = await client.post(
        f"{ORDERS}/{number}/pay", json={"payment": CARD}, headers={"Idempotency-Key": uuid.uuid4().hex}
    )
    cancelled = await client.post(f"{ORDERS}/{number}/cancel")

    assert (paid.status_code, paid.json()["code"]) == (409, "invalid_transition")
    assert (cancelled.status_code, cancelled.json()["code"]) == (409, "invalid_transition")


async def test_a_failed_cycle_keeps_the_loop_alive_without_a_heartbeat(tmp_path: Path) -> None:
    heartbeat = tmp_path / "heartbeat"
    stop = asyncio.Event()
    seen: list[bool] = []

    async def cycle() -> None:
        seen.append(heartbeat.exists())
        if len(seen) == 1:
            raise RuntimeError("boom")
        if len(seen) == 3:
            stop.set()

    with structlog.testing.capture_logs() as logs:
        await run_cycles(cycle, interval=0, stop=stop, heartbeat=heartbeat)

    assert seen == [False, False, True]
    assert any(log["event"] == "worker_cycle_failed" for log in logs)


async def test_stopping_ends_the_wait_between_cycles(tmp_path: Path) -> None:
    stop = asyncio.Event()

    async def cycle() -> None:
        asyncio.get_running_loop().call_soon(stop.set)

    await asyncio.wait_for(
        run_cycles(cycle, interval=3600, stop=stop, heartbeat=tmp_path / "heartbeat"), timeout=2
    )
