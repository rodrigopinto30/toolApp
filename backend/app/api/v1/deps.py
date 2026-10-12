from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request

from app.core.container import AuthServiceDep, RateLimiterDep
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import ACCESS_COOKIE
from app.models import User, UserRole


def client_ip(request: Request) -> str:
    """nginx sets X-Real-IP to the peer address; X-Forwarded-For can be forged by clients."""
    if ip := request.headers.get("x-real-ip"):
        return ip
    return request.client.host if request.client else "unknown"


async def get_current_user(request: Request, auth: AuthServiceDep) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise UnauthorizedError()
    return await auth.authenticate(token)


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: UserRole) -> Callable[[User], Awaitable[User]]:
    async def dependency(user: CurrentUser) -> User:
        if user.role != role:
            raise ForbiddenError()
        return user

    return dependency


async def get_verified_user(user: CurrentUser) -> User:
    if user.email_verified_at is None:
        raise ForbiddenError("Verify your email first.", code="email_not_verified")
    return user


VerifiedUser = Annotated[User, Depends(get_verified_user)]


def ip_rate_limit(name: str, *, limit: int, window: int) -> Callable[..., Awaitable[None]]:
    async def dependency(request: Request, limiter: RateLimiterDep) -> None:
        await limiter.hit(name, client_ip(request), limit=limit, window=window)

    return dependency


def user_rate_limit(name: str, *, limit: int, window: int) -> Callable[..., Awaitable[None]]:
    async def dependency(user: CurrentUser, limiter: RateLimiterDep) -> None:
        await limiter.hit(name, str(user.id), limit=limit, window=window)

    return dependency
