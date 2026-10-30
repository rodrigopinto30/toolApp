from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, ExchangeRate, PickupPoint, Province, ShippingZone, User
from tests.conftest import RevalidationLog
from tests.factories import make_province

ADMIN = "/api/v1/admin"
ZONE = {
    "code": "Patagonia-Sur",
    "name": {"es": "Patagonia Sur", "en": "Southern Patagonia"},
    "cost_usd": "12.50",
    "free_over_usd": "200.00",
    "eta_min_days": 3,
    "eta_max_days": 7,
}
POINT = {
    "name": "Sucursal Norte",
    "address": "Av. Cabildo 2000, CABA",
    "hours": {"mon_fri": "09:00-18:00"},
}


async def audit_rows(session: AsyncSession, entity: str) -> list[AuditLog]:
    statement = select(AuditLog).where(AuditLog.entity == entity).order_by(AuditLog.id)
    return list((await session.scalars(statement)).all())


async def zone_id(client: AsyncClient, **overrides: Any) -> int:
    response = await client.post(f"{ADMIN}/zones", json=ZONE | overrides)
    assert response.status_code == 201, response.json()
    return response.json()["id"]


async def test_exchange_rate_is_appended_with_its_author(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    response = await client.post(
        f"{ADMIN}/exchange-rates",
        json={"rate": "1500.25"},
        headers={"X-Real-IP": "203.0.113.9", "X-Request-ID": "req-exchange-rate"},
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["rate"], body["created_by"]) == ("1500.250000", admin.id)
    assert revalidations.tags == [["pricing"]]

    [log] = await audit_rows(session, "exchange_rate")
    assert (log.action, log.actor_id, log.entity_id) == ("create", admin.id, str(body["id"]))
    assert (log.ip, log.request_id) == ("203.0.113.9", "req-exchange-rate")
    assert log.changes == {"rate": {"before": None, "after": "1500.250000"}}


async def test_exchange_rate_change_reaches_the_public_api_at_once(
    client: AsyncClient, admin: User
) -> None:
    await client.post(f"{ADMIN}/exchange-rates", json={"rate": "1000"})
    assert Decimal((await client.get("/api/v1/exchange-rate")).json()["rate"]) == Decimal("1000")

    await client.post(f"{ADMIN}/exchange-rates", json={"rate": "1100"})

    assert Decimal((await client.get("/api/v1/exchange-rate")).json()["rate"]) == Decimal("1100")


@pytest.mark.parametrize("rate", ["0", "-1", "1.1234567", "1234567890123.1"])
async def test_invalid_exchange_rates_are_rejected(
    client: AsyncClient, session: AsyncSession, admin: User, rate: str
) -> None:
    response = await client.post(f"{ADMIN}/exchange-rates", json={"rate": rate})

    assert response.status_code == 422
    assert await audit_rows(session, "exchange_rate") == []


async def test_exchange_rate_history_is_newest_first(client: AsyncClient, admin: User) -> None:
    for rate in ("1000", "1100", "1200"):
        await client.post(f"{ADMIN}/exchange-rates", json={"rate": rate})

    body = (await client.get(f"{ADMIN}/exchange-rates", params={"size": 2})).json()

    assert [Decimal(item["rate"]) for item in body["items"]] == [Decimal("1200"), Decimal("1100")]
    assert (body["page"], body["size"], body["total"], body["pages"]) == (1, 2, 3, 2)


async def test_page_size_has_a_limit(client: AsyncClient, admin: User) -> None:
    assert (await client.get(f"{ADMIN}/zones", params={"size": 101})).status_code == 422


async def test_zone_crud_is_audited_and_published(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    new_id = await zone_id(client)

    read = (await client.get(f"{ADMIN}/zones/{new_id}")).json()
    assert read["code"] == "patagonia-sur"
    assert read["name"] == ZONE["name"]

    updated = await client.patch(
        f"{ADMIN}/zones/{new_id}", json={"cost_usd": "15.00", "free_over_usd": None}
    )
    assert updated.status_code == 200
    assert updated.json()["free_over_usd"] is None

    assert (await client.delete(f"{ADMIN}/zones/{new_id}")).status_code == 204
    assert (await client.get(f"{ADMIN}/zones/{new_id}")).status_code == 404

    create, update, delete = await audit_rows(session, "shipping_zone")
    assert (create.action, update.action, delete.action) == ("create", "update", "delete")
    assert update.changes == {
        "cost_usd": {"before": "12.50", "after": "15.00"},
        "free_over_usd": {"before": "200.00", "after": None},
    }
    assert delete.changes is not None and delete.changes["code"]["before"] == "patagonia-sur"
    assert revalidations.tags == [["shipping"], ["shipping"], ["shipping"]]


async def test_a_patch_that_changes_nothing_is_neither_audited_nor_published(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    new_id = await zone_id(client)
    revalidations.tags.clear()

    response = await client.patch(f"{ADMIN}/zones/{new_id}", json={"cost_usd": "12.5"})

    assert response.status_code == 200
    assert [log.action for log in await audit_rows(session, "shipping_zone")] == ["create"]
    assert revalidations.tags == []


async def test_a_duplicate_zone_code_conflicts_and_leaves_no_audit_row(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    await zone_id(client)
    revalidations.tags.clear()

    response = await client.post(f"{ADMIN}/zones", json=ZONE)

    assert response.status_code == 409
    assert response.json()["code"] == "code_taken"
    assert len(await audit_rows(session, "shipping_zone")) == 1
    assert revalidations.tags == []


async def test_renaming_a_zone_code_to_a_taken_one_conflicts(
    client: AsyncClient, admin: User
) -> None:
    await zone_id(client)
    other = await zone_id(client, code="otra")

    response = await client.patch(f"{ADMIN}/zones/{other}", json={"code": "patagonia-sur"})

    assert response.status_code == 409
    assert response.json()["code"] == "code_taken"


@pytest.mark.parametrize(
    "change",
    [
        {"eta_min_days": 9},
        {"eta_max_days": 1},
    ],
)
async def test_eta_range_is_checked_on_the_merged_values(
    client: AsyncClient, admin: User, change: dict[str, int]
) -> None:
    new_id = await zone_id(client)

    response = await client.patch(f"{ADMIN}/zones/{new_id}", json=change)

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_eta_range"


@pytest.mark.parametrize("field", ["code", "name", "cost_usd", "eta_min_days", "is_active"])
async def test_required_zone_fields_cannot_be_null(
    client: AsyncClient, admin: User, field: str
) -> None:
    new_id = await zone_id(client)

    assert (await client.patch(f"{ADMIN}/zones/{new_id}", json={field: None})).status_code == 422


async def test_unknown_zone_fields_are_rejected(client: AsyncClient, admin: User) -> None:
    new_id = await zone_id(client)

    assert (await client.patch(f"{ADMIN}/zones/{new_id}", json={"id": 1})).status_code == 422


async def test_a_zone_with_provinces_cannot_be_deleted(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    province = await make_province(session)

    response = await client.delete(f"{ADMIN}/zones/{province.shipping_zone_id}")

    assert response.status_code == 409
    assert response.json()["code"] == "in_use"
    assert await session.get(ShippingZone, province.shipping_zone_id) is not None
    assert await audit_rows(session, "shipping_zone") == []


async def test_missing_zone_answers_404(client: AsyncClient, admin: User) -> None:
    assert (await client.patch(f"{ADMIN}/zones/999999", json={})).status_code == 404
    assert (await client.delete(f"{ADMIN}/zones/999999")).status_code == 404


async def test_provinces_change_zone_only(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    province = await make_province(session)
    new_zone = await zone_id(client)
    revalidations.tags.clear()

    response = await client.patch(
        f"{ADMIN}/provinces/{province.code}", json={"shipping_zone_id": new_zone}
    )

    assert response.status_code == 200
    assert response.json()["shipping_zone_id"] == new_zone
    assert revalidations.tags == [["shipping"]]
    [log] = await audit_rows(session, "province")
    assert log.entity_id == province.code
    assert log.changes == {
        "shipping_zone_id": {"before": province.shipping_zone_id, "after": new_zone}
    }

    renamed = await client.patch(f"{ADMIN}/provinces/{province.code}", json={"name": "Otra"})
    assert renamed.status_code == 422


async def test_a_province_needs_an_existing_zone(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    province = await make_province(session)

    response = await client.patch(
        f"{ADMIN}/provinces/{province.code}", json={"shipping_zone_id": 999999}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "unknown_zone"
    assert await session.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.entity == "province")
    ) == 0


async def test_provinces_are_listed_by_name(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    await make_province(session)
    await make_province(session)

    body = (await client.get(f"{ADMIN}/provinces")).json()

    names = [item["name"] for item in body["items"]]
    assert names == sorted(names)
    assert body["total"] == await session.scalar(select(func.count()).select_from(Province))


async def test_unknown_province_answers_404(client: AsyncClient, admin: User) -> None:
    response = await client.patch(f"{ADMIN}/provinces/XX-X", json={"shipping_zone_id": 1})

    assert response.status_code == 404


async def test_pickup_point_crud_reaches_the_public_list(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    created = await client.post(f"{ADMIN}/pickup-points", json=POINT)
    assert created.status_code == 201
    new_id = created.json()["id"]

    public = (await client.get("/api/v1/pickup-points")).json()
    assert new_id in [point["id"] for point in public]

    hidden = await client.patch(
        f"{ADMIN}/pickup-points/{new_id}", json={"is_active": False, "hours": None}
    )
    assert hidden.status_code == 200
    assert hidden.json()["hours"] is None

    public = (await client.get("/api/v1/pickup-points")).json()
    assert new_id not in [point["id"] for point in public]

    assert (await client.get(f"{ADMIN}/pickup-points/{new_id}")).json()["is_active"] is False
    assert (await client.delete(f"{ADMIN}/pickup-points/{new_id}")).status_code == 204
    assert await session.get(PickupPoint, new_id) is None

    actions = [log.action for log in await audit_rows(session, "pickup_point")]
    assert actions == ["create", "update", "delete"]
    assert revalidations.tags == [["shipping"]] * 3


async def test_exchange_rate_rows_are_never_edited_through_the_api(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    await client.post(f"{ADMIN}/exchange-rates", json={"rate": "1000"})
    rate = await session.scalar(select(ExchangeRate.id))

    assert (await client.patch(f"{ADMIN}/exchange-rates/{rate}", json={})).status_code == 404
    assert (await client.delete(f"{ADMIN}/exchange-rates/{rate}")).status_code == 404
