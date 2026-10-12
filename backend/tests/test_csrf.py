from httpx import AsyncClient

from app.core.config import Settings
from app.core.security import CSRF_COOKIE, CSRF_HEADER

LOGIN = "/api/v1/auth/login"
CREDENTIALS = {"email": "nobody@example.com", "password": "whatever-password"}


async def _csrf(client: AsyncClient) -> str:
    await client.get("/api/v1/auth/csrf")
    token = client.cookies.get(CSRF_COOKIE)
    assert token
    return token


async def test_csrf_cookie_attributes(raw_client: AsyncClient) -> None:
    response = await raw_client.get("/api/v1/auth/csrf")

    cookie = response.headers["set-cookie"]
    assert response.status_code == 204
    assert "Secure" in cookie and "SameSite=lax" in cookie and "HttpOnly" not in cookie


async def test_auth_endpoints_require_the_token(raw_client: AsyncClient) -> None:
    token = await _csrf(raw_client)

    missing = await raw_client.post(LOGIN, json=CREDENTIALS)
    wrong = await raw_client.post(LOGIN, json=CREDENTIALS, headers={CSRF_HEADER: "wrong"})
    valid = await raw_client.post(LOGIN, json=CREDENTIALS, headers={CSRF_HEADER: token})

    assert missing.status_code == wrong.status_code == 403
    assert missing.json()["code"] == "csrf_failed"
    assert valid.status_code == 401


async def test_session_cookie_makes_any_unsafe_request_protected(raw_client: AsyncClient) -> None:
    raw_client.cookies.set("__Host-access", "anything")

    response = await raw_client.patch("/api/v1/me", json={"first_name": "Eve"})

    assert response.status_code == 403


async def test_public_post_without_session_is_not_affected(raw_client: AsyncClient) -> None:
    response = await raw_client.post(
        "/api/v1/shipping/quote",
        json={"delivery_method": "pickup", "items": [{"variant_id": 999999, "quantity": 1}]},
    )

    assert response.status_code != 403


async def test_cross_origin_requests_are_rejected(
    raw_client: AsyncClient, settings: Settings
) -> None:
    token = await _csrf(raw_client)

    async def login_from(origin: str) -> int:
        headers = {CSRF_HEADER: token, "Origin": origin}
        return (await raw_client.post(LOGIN, json=CREDENTIALS, headers=headers)).status_code

    assert await login_from("https://evil.test") == 403
    assert await login_from(settings.public_url) == 401


async def test_safe_methods_are_not_checked(raw_client: AsyncClient) -> None:
    raw_client.cookies.set("__Host-access", "anything")

    assert (await raw_client.get("/api/v1/me")).status_code == 401
