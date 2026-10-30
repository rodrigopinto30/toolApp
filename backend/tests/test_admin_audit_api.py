from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User
from tests.factories import make_user

LOGS = "/api/v1/admin/audit-logs"
RATES = "/api/v1/admin/exchange-rates"
COUPONS = "/api/v1/admin/coupons"


async def write_some(client: AsyncClient) -> int:
    await client.post(RATES, json={"rate": "1000"})
    coupon = await client.post(COUPONS, json={"code": "AUDIT1", "type": "fixed", "value": "5.00"})
    await client.patch(f"{COUPONS}/{coupon.json()['id']}", json={"is_active": False})
    return coupon.json()["id"]


async def test_lists_the_newest_first_with_its_actor(client: AsyncClient, admin: User) -> None:
    await write_some(client)

    body = (await client.get(LOGS)).json()

    assert body["total"] == 3
    assert [item["action"] for item in body["items"]] == ["update", "create", "create"]
    newest = body["items"][0]
    assert (newest["actor_id"], newest["actor_email"]) == (admin.id, admin.email)
    assert newest["changes"] == {"is_active": {"before": True, "after": False}}
    assert newest["request_id"]


async def test_reads_are_not_audited(client: AsyncClient, admin: User) -> None:
    await client.get(RATES)
    await client.get(LOGS)

    assert (await client.get(LOGS)).json()["total"] == 0


async def test_filters_by_entity_id_and_action(client: AsyncClient, admin: User) -> None:
    coupon_id = await write_some(client)

    by_entity = (await client.get(LOGS, params={"entity": "exchange_rate"})).json()
    assert [item["entity"] for item in by_entity["items"]] == ["exchange_rate"]

    by_id = await client.get(LOGS, params={"entity": "coupon", "entity_id": str(coupon_id)})
    assert by_id.json()["total"] == 2

    by_action = await client.get(LOGS, params={"entity": "coupon", "action": "update"})
    assert by_action.json()["total"] == 1


async def test_filters_by_actor(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    await write_some(client)
    other = await make_user(session)

    mine = await client.get(LOGS, params={"actor_id": admin.id})
    assert mine.json()["total"] == 3
    theirs = await client.get(LOGS, params={"actor_id": other.id})
    assert theirs.json()["total"] == 0


async def test_filters_by_dates(client: AsyncClient, session: AsyncSession, admin: User) -> None:
    await write_some(client)
    old = datetime(2026, 1, 1, tzinfo=UTC)
    await session.execute(update(AuditLog).where(AuditLog.entity == "coupon").values(created_at=old))

    recent = await client.get(LOGS, params={"date_from": "2026-06-01T00:00:00Z"})
    assert recent.json()["total"] == 1

    upto = (old + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    early = await client.get(LOGS, params={"date_to": upto})
    assert early.json()["total"] == 2


async def test_only_get_is_exposed(client: AsyncClient, admin: User) -> None:
    assert (await client.post(LOGS, json={})).status_code == 405
