from enum import StrEnum

from redis.asyncio import Redis

from app.auth.store import redis_required
from app.core.security import hash_token, new_token


class TokenPurpose(StrEnum):
    VERIFY_EMAIL = "verify"
    RESET_PASSWORD = "reset"


class OneTimeTokenStore:
    """Single-use tokens sent by email. Only their hash is stored; issuing a new token
    for the same user and purpose invalidates the previous one."""

    def __init__(self, redis: Redis, *, prefix: str) -> None:
        self.redis = redis
        self.prefix = prefix

    def _token_key(self, purpose: TokenPurpose, token_hash: str) -> str:
        return f"{self.prefix}:{purpose}:{token_hash}"

    def _user_key(self, purpose: TokenPurpose, user_id: int) -> str:
        return f"{self.prefix}:{purpose}:user:{user_id}"

    async def issue(self, purpose: TokenPurpose, user_id: int, ttl: int) -> str:
        token = new_token()
        token_hash = hash_token(token)
        user_key = self._user_key(purpose, user_id)
        with redis_required():
            previous = await self.redis.set(user_key, token_hash, ex=ttl, get=True)
            async with self.redis.pipeline(transaction=True) as pipe:
                if previous:
                    pipe.delete(self._token_key(purpose, previous))
                await pipe.set(self._token_key(purpose, token_hash), user_id, ex=ttl).execute()
        return token

    async def consume(self, purpose: TokenPurpose, token: str) -> int | None:
        with redis_required():
            user_id = await self.redis.getdel(self._token_key(purpose, hash_token(token)))
            if user_id is None:
                return None
            await self.redis.delete(self._user_key(purpose, int(user_id)))
        return int(user_id)
