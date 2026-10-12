import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.exceptions import TooManyRequestsError
from app.core.security import hash_token

logger = structlog.get_logger(__name__)


def subject_key(value: str) -> str:
    """Emails and other personal data never appear in Redis keys."""
    return hash_token(value.lower())[:32]


class RateLimiter:
    """Fixed window counter per (name, key). Fails open if Redis is down."""

    def __init__(self, redis: Redis, *, prefix: str) -> None:
        self.redis = redis
        self.prefix = prefix

    async def hit(self, name: str, key: str, *, limit: int, window: int) -> None:
        redis_key = f"{self.prefix}:{name}:{key}"
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.incr(redis_key).expire(redis_key, window, nx=True).ttl(redis_key)
                count, _, ttl = await pipe.execute()
        except (RedisError, OSError) as exc:
            logger.warning("rate_limit_unavailable", name=name, error=str(exc))
            return
        if count > limit:
            logger.info("rate_limited", name=name)
            raise TooManyRequestsError(retry_after=ttl if ttl > 0 else window)


class LoginLockout:
    """Locks an email after `max_failures` failed logins until `lockout_seconds` pass.
    It works the same whether the account exists or not. Fails open if Redis is down."""

    def __init__(
        self, redis: Redis, *, prefix: str, max_failures: int, lockout_seconds: int
    ) -> None:
        self.redis = redis
        self.prefix = prefix
        self.max_failures = max_failures
        self.lockout_seconds = lockout_seconds

    def _key(self, email: str) -> str:
        return f"{self.prefix}:{subject_key(email)}"

    async def check(self, email: str) -> None:
        key = self._key(email)
        try:
            async with self.redis.pipeline(transaction=False) as pipe:
                failures, ttl = await pipe.get(key).ttl(key).execute()
        except (RedisError, OSError) as exc:
            logger.warning("login_lockout_unavailable", error=str(exc))
            return
        if failures is not None and int(failures) >= self.max_failures:
            raise TooManyRequestsError(
                "Too many failed attempts. Try again later.",
                code="account_locked",
                retry_after=ttl if ttl > 0 else self.lockout_seconds,
            )

    async def register_failure(self, email: str) -> None:
        key = self._key(email)
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.incr(key).expire(key, self.lockout_seconds, nx=True)
                failures, _ = await pipe.execute()
            if failures >= self.max_failures:
                await self.redis.expire(key, self.lockout_seconds)
        except (RedisError, OSError) as exc:
            logger.warning("login_lockout_unavailable", error=str(exc))

    async def reset(self, email: str) -> None:
        try:
            await self.redis.delete(self._key(email))
        except (RedisError, OSError) as exc:
            logger.warning("login_lockout_unavailable", error=str(exc))
