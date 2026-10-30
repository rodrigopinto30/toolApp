from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Address, AuditLog, Coupon, User
from tests.conftest import RevalidationLog
from tests.shopping import add_to_cart, login, place_order, shipping_body

COUPONS = "/api/v1/admin/coupons"
COUPON = {"code": "  verano-25 ", "type": "percent", "value": "25.00"}


async def create(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post(COUPONS, json=COUPON | overrides)
    assert response.status_code == 201, response.json()
    return response.json()


async def buy_with_coupon(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, code: str
) -> dict[str, Any]:
    await login(client, customer)
    await add_to_cart(client, session, "TRU-WP-6", 1)
    placed = await place_order(client, shipping_body(address, coupon_code=code))
    assert placed.status_code == 201, placed.json()
    return placed.json()


async def test_create_uppercases_the_code_and_fills_the_defaults(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    body = await create(client)

    assert body["code"] == "VERANO-25"
    assert (body["used_count"], body["is_active"]) == (0, True)
    assert body["starts_at"] is not None
    assert revalidations.tags == []

    log = await session.scalar(select(AuditLog).where(AuditLog.entity == "coupon"))
    assert log is not None
    assert log.action == "create"
    assert log.changes is not None
    assert log.changes["code"] == {"before": None, "after": "VERANO-25"}
    assert log.changes["type"] == {"before": None, "after": "percent"}


@pytest.mark.usefixtures("seeded")
async def test_a_new_coupon_works_at_the_checkout_preview(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, admin: User
) -> None:
    await create(client)
    await login(client, customer)
    await add_to_cart(client, session, "TRU-WP-6", 1)

    response = await client.post(
        "/api/v1/checkout/preview", json=shipping_body(address, coupon_code="verano-25")
    )

    assert response.status_code == 200, response.json()
    assert response.json()["coupon"]["code"] == "VERANO-25"


async def test_answers_and_audits_the_stored_values(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    coupon = await create(client, value="15")
    assert coupon["value"] == "15.00"

    updated = await client.patch(f"{COUPONS}/{coupon['id']}", json={"value": "20"})
    assert updated.json()["value"] == "20.00"

    log = await session.scalar(
        select(AuditLog).where(AuditLog.entity == "coupon", AuditLog.action == "update")
    )
    assert log is not None
    assert log.changes == {"value": {"before": "15.00", "after": "20.00"}}


async def test_a_duplicate_code_conflicts_whatever_its_case(
    client: AsyncClient, admin: User
) -> None:
    await create(client)

    response = await client.post(COUPONS, json=COUPON | {"code": "VERANO-25"})

    assert response.status_code == 409
    assert response.json()["code"] == "code_taken"


@pytest.mark.parametrize(
    "change",
    [
        {"code": "ab"},
        {"code": "con espacios"},
        {"value": "0"},
        {"value": "10.123"},
        {"type": "other"},
        {"max_uses": 0},
        {"max_uses_per_user": -1},
        {"min_subtotal_usd": "-1"},
        {"starts_at": "2026-10-30T12:00:00"},
    ],
)
async def test_invalid_fields_are_rejected(
    client: AsyncClient, admin: User, change: dict[str, Any]
) -> None:
    assert (await client.post(COUPONS, json=COUPON | change)).status_code == 422


async def test_a_percent_coupon_cannot_exceed_100(client: AsyncClient, admin: User) -> None:
    response = await client.post(COUPONS, json=COUPON | {"value": "100.01"})

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_coupon_value"


async def test_the_percent_limit_is_checked_on_the_merged_values(
    client: AsyncClient, admin: User
) -> None:
    coupon = await create(client, type="fixed", value="150.00")

    response = await client.patch(f"{COUPONS}/{coupon['id']}", json={"type": "percent"})

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_coupon_value"


async def test_a_coupon_must_end_after_it_starts(client: AsyncClient, admin: User) -> None:
    coupon = await create(client, starts_at="2026-11-01T00:00:00Z")

    response = await client.patch(
        f"{COUPONS}/{coupon['id']}", json={"ends_at": "2026-11-01T00:00:00Z"}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_coupon_period"


async def test_update_is_audited_field_by_field(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    coupon = await create(client)

    response = await client.patch(
        f"{COUPONS}/{coupon['id']}", json={"value": "30.00", "max_uses": 10, "is_active": False}
    )

    assert response.status_code == 200
    log = await session.scalar(
        select(AuditLog).where(AuditLog.entity == "coupon", AuditLog.action == "update")
    )
    assert log is not None
    assert log.changes == {
        "is_active": {"before": True, "after": False},
        "max_uses": {"before": None, "after": 10},
        "value": {"before": "25.00", "after": "30.00"},
    }


@pytest.mark.usefixtures("seeded", "gateway")
@pytest.mark.parametrize("change", [{"code": "OTRO-1"}, {"type": "fixed"}, {"value": "10.00"}])
async def test_code_type_and_value_are_frozen_once_used(
    client: AsyncClient,
    session: AsyncSession,
    customer: User,
    address: Address,
    admin: User,
    change: dict[str, str],
) -> None:
    coupon = await create(client)
    await buy_with_coupon(client, session, customer, address, "VERANO-25")
    await login(client, admin)

    response = await client.patch(f"{COUPONS}/{coupon['id']}", json=change)

    assert response.status_code == 409
    assert response.json()["code"] == "coupon_used"


@pytest.mark.usefixtures("seeded", "gateway")
async def test_a_cancelled_order_keeps_the_coupon_frozen_and_undeletable(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, admin: User
) -> None:
    coupon = await create(client)
    order = await buy_with_coupon(client, session, customer, address, "VERANO-25")
    cancelled = await client.post(f"/api/v1/me/orders/{order['number']}/cancel")
    assert cancelled.status_code == 200, cancelled.json()
    await login(client, admin)

    assert (await client.get(f"{COUPONS}/{coupon['id']}")).json()["used_count"] == 0
    renamed = await client.patch(f"{COUPONS}/{coupon['id']}", json={"code": "OTRO-1"})
    assert renamed.status_code == 409
    assert renamed.json()["code"] == "coupon_used"
    assert (await client.delete(f"{COUPONS}/{coupon['id']}")).json()["code"] == "in_use"


@pytest.mark.usefixtures("seeded", "gateway")
async def test_a_used_coupon_can_still_change_the_rest(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, admin: User
) -> None:
    coupon = await create(client)
    await buy_with_coupon(client, session, customer, address, "VERANO-25")
    await login(client, admin)

    response = await client.patch(
        f"{COUPONS}/{coupon['id']}",
        json={"type": "percent", "value": "25", "max_uses": 5, "is_active": False},
    )

    assert response.status_code == 200
    assert (response.json()["max_uses"], response.json()["is_active"]) == (5, False)


async def test_an_unused_coupon_can_be_deleted(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    coupon = await create(client)

    assert (await client.delete(f"{COUPONS}/{coupon['id']}")).status_code == 204
    assert (await client.get(f"{COUPONS}/{coupon['id']}")).status_code == 404

    log = await session.scalar(
        select(AuditLog).where(AuditLog.entity == "coupon", AuditLog.action == "delete")
    )
    assert log is not None
    assert log.changes is not None and log.changes["code"]["before"] == "VERANO-25"


@pytest.mark.usefixtures("seeded", "gateway")
async def test_a_coupon_with_orders_cannot_be_deleted(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address, admin: User
) -> None:
    coupon = await create(client)
    await buy_with_coupon(client, session, customer, address, "VERANO-25")
    await login(client, admin)

    response = await client.delete(f"{COUPONS}/{coupon['id']}")

    assert response.status_code == 409
    assert response.json()["code"] == "in_use"
    assert await session.get(Coupon, coupon["id"]) is not None
