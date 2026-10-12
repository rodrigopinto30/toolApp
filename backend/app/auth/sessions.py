import secrets
import time
from dataclasses import dataclass

import structlog
from redis.asyncio import Redis

from app.auth.store import redis_required
from app.core.config import Settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import hash_token, new_token

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class RefreshSession:
    user_id: int
    family_id: str
    refresh_token: str


class RefreshSessionStore:
    """Refresh tokens grouped in families (one per login). Every refresh rotates the token;
    presenting a rotated token again revokes the whole family, except within a short grace
    window, so concurrent refreshes from two tabs do not log the user out."""

    def __init__(self, redis: Redis, settings: Settings, *, prefix: str) -> None:
        self.redis = redis
        self.settings = settings
        self.prefix = prefix

    def _token_key(self, token: str) -> str:
        return f"{self.prefix}:refresh:{hash_token(token)}"

    def _family_key(self, family_id: str) -> str:
        return f"{self.prefix}:family:{family_id}"

    def _user_key(self, user_id: int) -> str:
        return f"{self.prefix}:user:{user_id}:families"

    async def create(self, user_id: int) -> RefreshSession:
        family_id = secrets.token_urlsafe(16)
        max_age = self.settings.refresh_session_max_age
        with redis_required():
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.hset(self._family_key(family_id), mapping={"user_id": user_id})
                pipe.expire(self._family_key(family_id), max_age)
                pipe.sadd(self._user_key(user_id), family_id)
                pipe.expire(self._user_key(user_id), max_age)
                await pipe.execute()
            return await self._issue(user_id, family_id, self.settings.refresh_token_ttl)

    async def _issue(self, user_id: int, family_id: str, ttl: int) -> RefreshSession:
        token = new_token()
        async with self.redis.pipeline(transaction=True) as pipe:
            pipe.hset(self._token_key(token), mapping={"user_id": user_id, "family_id": family_id})
            pipe.expire(self._token_key(token), ttl)
            await pipe.execute()
        return RefreshSession(user_id, family_id, token)

    async def rotate(self, token: str) -> RefreshSession:
        key = self._token_key(token)
        with redis_required():
            data = await self.redis.hgetall(key)
            if not data:
                raise UnauthorizedError()
            user_id, family_id = int(data["user_id"]), data["family_id"]
            family_ttl = await self.redis.ttl(self._family_key(family_id))
            if family_ttl <= 0:
                raise UnauthorizedError()

            claimed = await self.redis.hsetnx(key, "rotated_at", f"{time.time():.6f}")
            if not claimed:
                rotated_at = float(await self.redis.hget(key, "rotated_at") or 0)
                if time.time() - rotated_at <= self.settings.refresh_reuse_grace:
                    raise ConflictError(
                        "The session is being refreshed. Retry the request.",
                        code="refresh_in_progress",
                    )
                logger.warning("refresh_token_reused", user_id=user_id)
                await self.revoke_family(family_id)
                raise UnauthorizedError()

            ttl = min(self.settings.refresh_token_ttl, family_ttl)
            return await self._issue(user_id, family_id, ttl)

    async def family_of(self, token: str) -> str | None:
        with redis_required():
            return await self.redis.hget(self._token_key(token), "family_id")

    async def revoke_family(self, family_id: str) -> None:
        with redis_required():
            user_id = await self.redis.hget(self._family_key(family_id), "user_id")
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.delete(self._family_key(family_id))
                if user_id is not None:
                    pipe.srem(self._user_key(int(user_id)), family_id)
                await pipe.execute()

    async def revoke_user(self, user_id: int) -> None:
        with redis_required():
            family_ids = await self.redis.smembers(self._user_key(user_id))
            keys = [self._family_key(family_id) for family_id in family_ids]
            await self.redis.delete(self._user_key(user_id), *keys)
