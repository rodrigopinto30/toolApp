import uuid

import pytest
from fastapi import FastAPI
from redis.asyncio import Redis

from app.auth.rate_limit import LoginLockout, RateLimiter
from app.core.exceptions import TooManyRequestsError


def _prefix() -> str:
    return f"test:{uuid.uuid4().hex}"


async def test_rate_limiter_blocks_over_the_limit(app: FastAPI) -> None:
    limiter = RateLimiter(app.state.redis, prefix=_prefix())
    for _ in range(3):
        await limiter.hit("login", "1.2.3.4", limit=3, window=60)

    with pytest.raises(TooManyRequestsError) as error:
        await limiter.hit("login", "1.2.3.4", limit=3, window=60)
    assert error.value.headers is not None
    assert 0 < int(error.value.headers["Retry-After"]) <= 60
    await limiter.hit("login", "5.6.7.8", limit=3, window=60)


async def test_lockout_after_max_failures(app: FastAPI) -> None:
    lockout = LoginLockout(app.state.redis, prefix=_prefix(), max_failures=3, lockout_seconds=900)
    for _ in range(3):
        await lockout.check("ana@example.com")
        await lockout.register_failure("ana@example.com")

    with pytest.raises(TooManyRequestsError) as error:
        await lockout.check("ana@example.com")
    assert error.value.code == "account_locked"
    await lockout.check("other@example.com")


async def test_lockout_reset(app: FastAPI) -> None:
    lockout = LoginLockout(app.state.redis, prefix=_prefix(), max_failures=2, lockout_seconds=900)
    await lockout.register_failure("ana@example.com")

    await lockout.reset("ana@example.com")
    await lockout.register_failure("ana@example.com")

    await lockout.check("ana@example.com")


async def test_fails_open_without_redis() -> None:
    redis = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2)
    limiter = RateLimiter(redis, prefix="test")
    lockout = LoginLockout(redis, prefix="test", max_failures=1, lockout_seconds=60)

    for _ in range(3):
        await limiter.hit("login", "1.2.3.4", limit=1, window=60)
        await lockout.register_failure("ana@example.com")
    await lockout.check("ana@example.com")
    await redis.aclose()
