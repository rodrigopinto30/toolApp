from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, create_access_token
from app.models import User
from tests.conftest import Outbox
from tests.factories import make_user

PASSWORD = "a-long-password"
AUTH = "/api/v1/auth"
REFRESH_PATH = AUTH


async def login(client: AsyncClient, email: str, password: str = PASSWORD) -> int:
    response = await client.post(f"{AUTH}/login", json={"email": email, "password": password})
    return response.status_code


def use_refresh_token(client: AsyncClient, token: str | None) -> None:
    client.cookies.delete(REFRESH_COOKIE)
    client.cookies.set(REFRESH_COOKIE, token or "", path=REFRESH_PATH)


def _registration(email: str) -> dict[str, str]:
    return {"email": email, "password": PASSWORD, "first_name": "Ana", "last_name": "Diaz"}


async def test_register_sends_verification_email(client: AsyncClient, outbox: Outbox) -> None:
    response = await client.post(f"{AUTH}/register", json=_registration("New.User@Example.com"))

    assert response.status_code == 202
    [email] = outbox.sent("verify_email")
    assert email.to == "new.user@example.com"
    assert "/es/verify-email#token=" in email.text
    assert ACCESS_COOKIE not in response.cookies
    assert await login(client, "new.user@example.com") == 200


async def test_register_existing_email_looks_the_same(
    client: AsyncClient, session: AsyncSession, outbox: Outbox
) -> None:
    user = await make_user(session, password=PASSWORD)
    new = await client.post(f"{AUTH}/register", json=_registration("someone-new@example.com"))

    existing = await client.post(f"{AUTH}/register", json=_registration(user.email.upper()))

    assert existing.status_code == new.status_code == 202
    assert existing.json() == new.json()
    assert [m.to for m in outbox.sent("account_exists")] == [user.email]


async def test_login_sets_session_cookies(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    user = await make_user(session, password=PASSWORD)

    response = await client.post(f"{AUTH}/login", json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 200
    assert response.json()["email"] == user.email
    cookies = response.headers.get_list("set-cookie")
    access = next(c for c in cookies if c.startswith(f"{ACCESS_COOKIE}="))
    refresh = next(c for c in cookies if c.startswith(f"{REFRESH_COOKIE}="))
    assert "HttpOnly" in access and "Secure" in access and "Path=/;" in access
    assert f"Max-Age={settings.refresh_token_ttl}" in access
    assert "SameSite=strict" in refresh and "Path=/api/v1/auth" in refresh
    assert (await client.get("/api/v1/me")).json()["id"] == user.id


async def test_wrong_credentials_are_indistinguishable(
    client: AsyncClient, session: AsyncSession
) -> None:
    user = await make_user(session, password=PASSWORD)

    wrong_password = await client.post(
        f"{AUTH}/login", json={"email": user.email, "password": "not-the-password"}
    )
    unknown_email = await client.post(
        f"{AUTH}/login", json={"email": "ghost@example.com", "password": PASSWORD}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["code"] == unknown_email.json()["code"] == "invalid_credentials"
    assert wrong_password.json()["message"] == unknown_email.json()["message"]


async def test_disabled_account(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, password=PASSWORD, is_active=False)

    response = await client.post(f"{AUTH}/login", json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 403
    assert response.json()["code"] == "account_disabled"


async def test_lockout_after_failed_logins(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    user = await make_user(session, password=PASSWORD)
    for ip in range(settings.login_max_failures):
        client.headers["X-Real-IP"] = f"10.0.0.{ip}"
        assert await login(client, user.email, "wrong-password") == 401

    client.headers["X-Real-IP"] = "10.0.1.1"
    response = await client.post(f"{AUTH}/login", json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 429
    assert response.json()["code"] == "account_locked"
    assert int(response.headers["Retry-After"]) > 0


async def test_login_rate_limit_per_ip(client: AsyncClient) -> None:
    codes = [await login(client, "ghost@example.com") for _ in range(6)]

    assert codes == [401] * 5 + [429]


async def test_refresh_rotates_and_detects_reuse(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    user = await make_user(session, password=PASSWORD)
    await login(client, user.email)
    old_refresh = client.cookies.get(REFRESH_COOKIE, path=REFRESH_PATH)

    refreshed = await client.post(f"{AUTH}/refresh")
    assert refreshed.status_code == 200
    new_refresh = client.cookies.get(REFRESH_COOKIE, path=REFRESH_PATH)
    assert new_refresh != old_refresh

    use_refresh_token(client, old_refresh)
    reused = await client.post(f"{AUTH}/refresh")
    assert reused.status_code == 409
    assert reused.json()["code"] == "refresh_in_progress"


async def test_refresh_without_cookie(client: AsyncClient) -> None:
    assert (await client.post(f"{AUTH}/refresh")).status_code == 401


async def test_logout_revokes_the_session(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session, password=PASSWORD)
    await login(client, user.email)
    refresh = client.cookies.get(REFRESH_COOKIE, path=REFRESH_PATH)

    response = await client.post(f"{AUTH}/logout")

    assert response.status_code == 204
    assert client.cookies.get(ACCESS_COOKIE) is None
    await client.get(f"{AUTH}/csrf")
    use_refresh_token(client, refresh)
    again = await client.post(f"{AUTH}/refresh")
    assert again.status_code == 401


async def test_expired_access_token(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    user = await make_user(session)
    past = datetime.now(UTC) - timedelta(hours=1)
    token = create_access_token(settings, user_id=user.id, role=user.role, session_id="x", now=past)
    client.cookies.set(ACCESS_COOKIE, token)

    response = await client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.json()["code"] == "token_expired"


async def _registered_token(client: AsyncClient, outbox: Outbox, email: str) -> str:
    await client.post(f"{AUTH}/register", json=_registration(email))
    return outbox.token("verify_email")


async def test_verify_email(client: AsyncClient, outbox: Outbox) -> None:
    token = await _registered_token(client, outbox, "verify-me@example.com")

    assert (await client.post(f"{AUTH}/verify-email", json={"token": token})).status_code == 204
    again = await client.post(f"{AUTH}/verify-email", json={"token": token})

    assert again.status_code == 400
    assert again.json()["code"] == "invalid_token"
    await login(client, "verify-me@example.com")
    assert (await client.get("/api/v1/me")).json()["email_verified"] is True


async def test_resend_verification(
    client: AsyncClient, session: AsyncSession, outbox: Outbox
) -> None:
    user = await make_user(session, password=PASSWORD)
    await login(client, user.email)

    first = await client.post(f"{AUTH}/resend-verification", params={"locale": "en"})
    second = await client.post(f"{AUTH}/resend-verification")

    assert first.status_code == 202
    assert second.status_code == 429
    [email] = outbox.sent("verify_email")
    assert email.subject == "Confirm your email"


async def test_forgot_and_reset_password(
    client: AsyncClient, session: AsyncSession, outbox: Outbox
) -> None:
    user = await make_user(session, password=PASSWORD)
    await login(client, user.email)
    old_refresh = client.cookies.get(REFRESH_COOKIE, path=REFRESH_PATH)

    unknown = await client.post(f"{AUTH}/forgot-password", json={"email": "ghost@example.com"})
    known = await client.post(f"{AUTH}/forgot-password", json={"email": user.email})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    token = outbox.token("reset_password")

    new_password = "another-long-password"
    reset = await client.post(
        f"{AUTH}/reset-password", json={"token": token, "password": new_password}
    )
    reused = await client.post(
        f"{AUTH}/reset-password", json={"token": token, "password": new_password}
    )

    assert reset.status_code == 204
    assert reused.status_code == 400
    assert outbox.sent("password_changed")
    use_refresh_token(client, old_refresh)
    stale = await client.post(f"{AUTH}/refresh")
    assert stale.status_code == 401
    assert await login(client, user.email) == 401
    assert await login(client, user.email, new_password) == 200
    assert (await client.get("/api/v1/me")).json()["email_verified"] is True


@pytest.mark.parametrize("path", ["/me", "/me/addresses", "/me/billing-profiles"])
async def test_account_requires_authentication(client: AsyncClient, path: str) -> None:
    response = await client.get(f"/api/v1{path}")

    assert response.status_code == 401
    assert response.headers["Cache-Control"] == "no-store"


async def test_deactivated_user_loses_access(
    client: AsyncClient, session: AsyncSession
) -> None:
    user = await make_user(session, password=PASSWORD)
    await login(client, user.email)

    await _deactivate(session, user)

    assert (await client.get("/api/v1/me")).status_code == 401


async def _deactivate(session: AsyncSession, user: User) -> None:
    user.is_active = False
    await session.flush()
