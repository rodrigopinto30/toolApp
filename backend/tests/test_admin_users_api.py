from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.sessions import RefreshSessionStore
from app.cache.decorators import Cache
from app.core.config import Settings
from app.core.container import get_session_store
from app.core.exceptions import ConflictError, ServiceUnavailableError, UnauthorizedError
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import AuditLog, User, UserRole
from app.schemas.admin.users import UserUpdate
from app.services.admin.users import UserAdmin
from app.services.audit import AuditTrail
from app.services.revalidation import ChangePublisher
from tests.conftest import RevalidationLog
from tests.factories import make_user
from tests.shopping import PASSWORD, login

USERS = "/api/v1/admin/users"


class BrokenSessions:
    async def revoke_user(self, user_id: int) -> None:
        raise ServiceUnavailableError()


async def audit_rows(session: AsyncSession, user: User) -> list[AuditLog]:
    statement = select(AuditLog).where(AuditLog.entity == "user", AuditLog.entity_id == str(user.id))
    return list((await session.scalars(statement)).all())


async def test_lists_the_newest_first_without_secrets(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    user = await make_user(session, verified=True)

    response = await client.get(USERS)

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 2
    assert [item["id"] for item in body["items"]] == [user.id, admin.id]
    assert "password_hash" not in body["items"][0]
    assert body["items"][0]["email"] == user.email
    assert body["items"][0]["role"] == "customer"
    assert body["items"][0]["email_verified_at"] is not None


async def test_filters_the_list(client: AsyncClient, session: AsyncSession, admin: User) -> None:
    inactive = await make_user(session, is_active=False)
    named = await make_user(session)
    named.last_name = "Zapata"
    await session.flush()

    async def ids(**params: str) -> list[int]:
        body = (await client.get(USERS, params=params)).json()
        assert body["total"] == len(body["items"])
        return [item["id"] for item in body["items"]]

    assert await ids(role="admin") == [admin.id]
    assert await ids(is_active="false") == [inactive.id]
    assert await ids(q="zapa") == [named.id]
    assert await ids(q=inactive.email[:12]) == [inactive.id]
    assert await ids(q="%%") == []


async def test_detail(client: AsyncClient, session: AsyncSession, admin: User) -> None:
    user = await make_user(session)

    assert (await client.get(f"{USERS}/{user.id}")).json()["email"] == user.email
    assert (await client.get(f"{USERS}/999999")).status_code == 404


async def test_changes_the_role_with_an_audit_row(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    user = await make_user(session)

    promoted = (await client.patch(f"{USERS}/{user.id}", json={"role": "admin"})).json()
    demoted = (await client.patch(f"{USERS}/{user.id}", json={"role": "customer"})).json()

    assert (promoted["role"], demoted["role"]) == ("admin", "customer")
    first, second = await audit_rows(session, user)
    assert first.actor_id == admin.id
    assert first.action == "update"
    assert first.changes == {"role": {"before": "customer", "after": "admin"}}
    assert second.changes == {"role": {"before": "admin", "after": "customer"}}


async def test_a_patch_that_changes_nothing_writes_no_audit_row(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    user = await make_user(session)

    response = await client.patch(f"{USERS}/{user.id}", json={"role": "customer"})

    assert response.status_code == 200
    assert await audit_rows(session, user) == []


async def test_deactivating_closes_every_session(
    app: FastAPI,
    client: AsyncClient,
    raw_client: AsyncClient,
    session: AsyncSession,
    settings: Settings,
    key_prefix: str,
) -> None:
    user = await make_user(session, password=PASSWORD, verified=True)
    await login(client, user)
    access = client.cookies.get(ACCESS_COOKIE)
    refresh = client.cookies.get(REFRESH_COOKIE)
    store = RefreshSessionStore(app.state.redis, settings, prefix=key_prefix)
    assert await store.family_of(refresh) is not None
    admin = await make_user(session, password=PASSWORD, role=UserRole.ADMIN, verified=True)
    await login(client, admin)

    response = await client.patch(f"{USERS}/{user.id}", json={"is_active": False})

    assert (response.status_code, response.json()["is_active"]) == (200, False)
    with pytest.raises(UnauthorizedError):
        await store.rotate(refresh)
    raw_client.cookies.set(ACCESS_COOKIE, access)
    assert (await raw_client.get("/api/v1/me")).status_code == 401
    assert (await audit_rows(session, user))[0].changes == {
        "is_active": {"before": True, "after": False}
    }


async def test_a_session_store_failure_does_not_fail_the_change(
    app: FastAPI, client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    user = await make_user(session)
    app.dependency_overrides[get_session_store] = BrokenSessions

    response = await client.patch(f"{USERS}/{user.id}", json={"is_active": False})

    assert (response.status_code, response.json()["is_active"]) == (200, False)


async def test_a_demoted_admin_loses_access_at_once(
    client: AsyncClient, raw_client: AsyncClient, session: AsyncSession
) -> None:
    other = await make_user(session, password=PASSWORD, role=UserRole.ADMIN, verified=True)
    await login(client, other)
    raw_client.cookies.set(ACCESS_COOKIE, client.cookies.get(ACCESS_COOKIE))
    assert (await raw_client.get(USERS)).status_code == 200
    admin = await make_user(session, password=PASSWORD, role=UserRole.ADMIN, verified=True)
    await login(client, admin)

    await client.patch(f"{USERS}/{other.id}", json={"role": "customer"})

    assert (await raw_client.get(USERS)).status_code == 403


@pytest.mark.parametrize("body", [{"is_active": False}, {"role": "customer"}])
async def test_the_only_admin_cannot_step_down(
    client: AsyncClient, session: AsyncSession, admin: User, body: dict[str, Any]
) -> None:
    response = await client.patch(f"{USERS}/{admin.id}", json=body)

    assert (response.status_code, response.json()["code"]) == (409, "last_admin")
    assert await audit_rows(session, admin) == []


@pytest.mark.parametrize("body", [{"is_active": False}, {"role": "customer"}])
async def test_nobody_can_remove_themselves(
    client: AsyncClient, session: AsyncSession, admin: User, body: dict[str, Any]
) -> None:
    await make_user(session, role=UserRole.ADMIN)

    response = await client.patch(f"{USERS}/{admin.id}", json=body)

    assert (response.status_code, response.json()["code"]) == (409, "self_change")


async def test_an_admin_can_send_a_patch_for_themselves_that_keeps_their_access(
    client: AsyncClient, admin: User
) -> None:
    response = await client.patch(
        f"{USERS}/{admin.id}", json={"is_active": True, "role": "admin"}
    )

    assert response.status_code == 200


async def test_another_admin_can_be_removed(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    other = await make_user(session, role=UserRole.ADMIN)

    response = await client.patch(f"{USERS}/{other.id}", json={"is_active": False})

    assert (response.status_code, response.json()["is_active"]) == (200, False)


async def test_an_inactive_admin_does_not_count(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    await make_user(session, role=UserRole.ADMIN, is_active=False)

    response = await client.patch(f"{USERS}/{admin.id}", json={"role": "customer"})

    assert response.json()["code"] == "last_admin"


async def test_an_inactive_admin_can_come_back(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    other = await make_user(session, role=UserRole.ADMIN, is_active=False)

    response = await client.patch(f"{USERS}/{other.id}", json={"is_active": True})

    assert (response.status_code, response.json()["is_active"]) == (200, True)


async def test_a_request_that_lost_the_race_cannot_remove_the_last_admin(
    app: FastAPI,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    cache: Cache,
    revalidations: RevalidationLog,
    settings: Settings,
    key_prefix: str,
) -> None:
    last = await make_user(session, role=UserRole.ADMIN)
    former = await make_user(session)
    users = UserAdmin(
        SqlAlchemyUnitOfWork(session_factory),
        AuditTrail(former.id, "127.0.0.1", None),
        ChangePublisher(cache, revalidations),
        RefreshSessionStore(app.state.redis, settings, prefix=key_prefix),
    )

    with pytest.raises(ConflictError) as error:
        await users.update(last.id, UserUpdate(is_active=False))

    assert error.value.code == "last_admin"


@pytest.mark.parametrize(
    "body",
    [{"role": "owner"}, {"role": None}, {"is_active": None}, {"email": "new@example.com"}],
)
async def test_an_invalid_patch_is_rejected(
    client: AsyncClient, session: AsyncSession, admin: User, body: dict[str, Any]
) -> None:
    user = await make_user(session)

    assert (await client.patch(f"{USERS}/{user.id}", json=body)).status_code == 422
