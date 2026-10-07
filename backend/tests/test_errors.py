import asyncio
from collections.abc import AsyncIterator

import pytest
from fastapi import APIRouter, FastAPI, Response
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.exceptions import BusinessRuleViolation, ConflictError, NotFoundError
from app.main import create_app


def _build_app(settings: Settings) -> FastAPI:
    app = create_app(
        settings.model_copy(update={"request_timeout_seconds": 0.2, "max_body_bytes": 32})
    )
    router = APIRouter(prefix="/api/v1/test")

    @router.get("/not-found")
    async def not_found() -> None:
        raise NotFoundError("Product not found.")

    @router.get("/conflict")
    async def conflict() -> None:
        raise ConflictError(details={"field": "sku"})

    @router.get("/rule")
    async def rule() -> None:
        raise BusinessRuleViolation("Coupon expired.", code="coupon_expired")

    @router.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internal detail")

    @router.get("/slow")
    async def slow() -> dict[str, str]:
        await asyncio.sleep(2)
        return {"status": "late"}

    @router.get("/items/{item_id}")
    async def item(item_id: int) -> dict[str, int]:
        return {"id": item_id}

    @router.post("/echo")
    async def echo(payload: dict[str, str]) -> dict[str, str]:
        return payload

    @router.get("/public")
    async def public(response: Response) -> dict[str, str]:
        response.headers["Cache-Control"] = "public, max-age=60"
        return {"status": "ok"}

    app.include_router(router)
    return app


@pytest.fixture(scope="module")
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_build_app(settings), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def assert_error(response, status: int, code: str) -> dict:
    body = response.json()
    assert response.status_code == status
    assert body["code"] == code
    assert body["message"]
    assert body["request_id"] == response.headers["X-Request-ID"]
    return body


async def test_unknown_route_returns_uniform_404(client: AsyncClient) -> None:
    body = assert_error(await client.get("/api/v1/nothing"), 404, "not_found")
    assert set(body) == {"code", "message", "request_id"}


async def test_request_id_from_nginx_is_kept(client: AsyncClient) -> None:
    response = await client.get("/api/v1/nothing", headers={"X-Request-ID": "abc-123"})

    assert response.headers["X-Request-ID"] == "abc-123"
    assert response.json()["request_id"] == "abc-123"


@pytest.mark.parametrize("bad_id", ["has spaces", "x" * 65, "inject\"quote"])
async def test_invalid_request_id_is_replaced(client: AsyncClient, bad_id: str) -> None:
    response = await client.get("/api/health/live", headers={"X-Request-ID": bad_id})

    assert response.headers["X-Request-ID"] != bad_id
    assert len(response.headers["X-Request-ID"]) == 32


async def test_app_errors_map_to_status_and_code(client: AsyncClient) -> None:
    body = assert_error(await client.get("/api/v1/test/not-found"), 404, "not_found")
    assert body["message"] == "Product not found."

    body = assert_error(await client.get("/api/v1/test/conflict"), 409, "conflict")
    assert body["details"] == {"field": "sku"}

    assert_error(await client.get("/api/v1/test/rule"), 422, "coupon_expired")


async def test_validation_error_does_not_echo_input(client: AsyncClient) -> None:
    body = assert_error(await client.get("/api/v1/test/items/abc"), 422, "validation_error")

    assert body["details"][0]["loc"] == ["path", "item_id"]
    assert "input" not in body["details"][0]


async def test_method_not_allowed(client: AsyncClient) -> None:
    assert_error(await client.delete("/api/v1/test/items/1"), 405, "method_not_allowed")


async def test_unhandled_error_hides_details(client: AsyncClient) -> None:
    response = await client.get("/api/v1/test/crash")

    body = assert_error(response, 500, "internal_error")
    assert "secret" not in response.text
    assert body["message"] == "Internal server error."


async def test_slow_request_times_out_with_504(client: AsyncClient) -> None:
    assert_error(await client.get("/api/v1/test/slow"), 504, "timeout")


async def test_body_over_limit_by_content_length(client: AsyncClient) -> None:
    response = await client.post("/api/v1/test/echo", json={"text": "x" * 100})

    assert_error(response, 413, "payload_too_large")


async def test_body_over_limit_while_streaming(client: AsyncClient) -> None:
    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(10):
            yield b'{"t": "xxxxxxxx"}'

    response = await client.post(
        "/api/v1/test/echo", content=chunks(), headers={"Content-Type": "application/json"}
    )

    assert_error(response, 413, "payload_too_large")


async def test_small_body_is_accepted(client: AsyncClient) -> None:
    response = await client.post("/api/v1/test/echo", json={"a": "b"})

    assert response.status_code == 200
    assert response.json() == {"a": "b"}


async def test_endpoint_cache_control_is_respected(client: AsyncClient) -> None:
    response = await client.get("/api/v1/test/public")

    assert response.headers["Cache-Control"] == "public, max-age=60"
