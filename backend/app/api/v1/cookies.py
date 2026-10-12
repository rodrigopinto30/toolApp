import secrets

from fastapi import Response

from app.core.config import Settings
from app.core.security import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE
from app.services.auth import SessionTokens


def refresh_path(settings: Settings) -> str:
    return f"{settings.api_prefix}/v1/auth"


def set_csrf_cookie(response: Response, settings: Settings) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(32),
        max_age=settings.refresh_session_max_age,
        path="/",
        secure=True,
        httponly=False,
        samesite="lax",
    )


def set_session_cookies(response: Response, settings: Settings, tokens: SessionTokens) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        tokens.access_token,
        max_age=settings.access_token_ttl,
        path="/",
        secure=True,
        httponly=True,
        samesite="lax",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=settings.refresh_token_ttl,
        path=refresh_path(settings),
        secure=True,
        httponly=True,
        samesite="strict",
    )
    set_csrf_cookie(response, settings)


def clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    response.delete_cookie(
        REFRESH_COOKIE, path=refresh_path(settings), secure=True, httponly=True, samesite="strict"
    )
    response.delete_cookie(CSRF_COOKIE, path="/", secure=True, samesite="lax")
