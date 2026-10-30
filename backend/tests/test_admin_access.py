import re
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.routing import iter_route_contexts
from httpx import AsyncClient

from app.models import User

ADMIN_PREFIX = "/api/v1/admin"


def admin_routes(app: FastAPI) -> Iterator[tuple[str, str]]:
    for route in iter_route_contexts(app.router.routes):
        if route.path and route.path.startswith(ADMIN_PREFIX):
            path = re.sub(r"\{[^}]+\}", "1", route.path)
            for method in sorted(route.methods or ()):
                yield method, path


def test_the_admin_api_has_routes(app: FastAPI) -> None:
    assert len(list(admin_routes(app))) >= 20


async def test_a_visitor_gets_401_on_every_admin_route(app: FastAPI, client: AsyncClient) -> None:
    for method, path in admin_routes(app):
        response = await client.request(method, path)
        assert response.status_code == 401, (method, path)


async def test_a_customer_gets_403_on_every_admin_route(
    app: FastAPI, client: AsyncClient, customer: User
) -> None:
    for method, path in admin_routes(app):
        response = await client.request(method, path)
        assert response.status_code == 403, (method, path)


@pytest.mark.parametrize("path", ["/zones", "/coupons", "/exchange-rates", "/audit-logs"])
async def test_an_admin_gets_through(client: AsyncClient, admin: User, path: str) -> None:
    assert (await client.get(f"{ADMIN_PREFIX}{path}")).status_code == 200
