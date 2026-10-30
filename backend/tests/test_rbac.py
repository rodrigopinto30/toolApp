from collections.abc import Iterator

import pytest
from fastapi import APIRouter, FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import AdminUser, VerifiedUser
from app.models import User, UserRole
from tests.factories import make_user

PASSWORD = "a-long-password"


@pytest.fixture(scope="module")
def routes(app: FastAPI) -> Iterator[None]:
    router = APIRouter(prefix="/api/test-rbac")

    @router.get("/admin")
    async def admin_only(user: AdminUser) -> dict[str, int]:
        return {"id": user.id}

    @router.get("/verified")
    async def verified_only(user: VerifiedUser) -> dict[str, int]:
        return {"id": user.id}

    count = len(app.router.routes)
    app.include_router(router)
    yield
    del app.router.routes[count:]


async def _login_as(
    client: AsyncClient,
    session: AsyncSession,
    *,
    role: UserRole = UserRole.CUSTOMER,
    verified: bool = False,
) -> User:
    user = await make_user(session, password=PASSWORD, role=role, verified=verified)
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return user


async def test_anonymous_is_unauthorized(client: AsyncClient, routes: None) -> None:
    assert (await client.get("/api/test-rbac/admin")).status_code == 401


async def test_customer_is_forbidden_from_admin_routes(
    client: AsyncClient, session: AsyncSession, routes: None
) -> None:
    await _login_as(client, session)

    assert (await client.get("/api/test-rbac/admin")).status_code == 403


async def test_admin_is_allowed(client: AsyncClient, session: AsyncSession, routes: None) -> None:
    user = await _login_as(client, session, role=UserRole.ADMIN)

    assert (await client.get("/api/test-rbac/admin")).json() == {"id": user.id}


async def test_verified_email_required(
    client: AsyncClient, session: AsyncSession, routes: None
) -> None:
    await _login_as(client, session)

    response = await client.get("/api/test-rbac/verified")

    assert response.status_code == 403
    assert response.json()["code"] == "email_not_verified"


async def test_verified_user_is_allowed(
    client: AsyncClient, session: AsyncSession, routes: None
) -> None:
    user = await _login_as(client, session, verified=True)

    assert (await client.get("/api/test-rbac/verified")).json() == {"id": user.id}
