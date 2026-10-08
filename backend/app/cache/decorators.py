import hashlib
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, is_dataclass
from decimal import Decimal
from functools import wraps
from typing import Any, Protocol, get_type_hints

import structlog
from pydantic import TypeAdapter
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import Settings

logger = structlog.get_logger(__name__)


def _json_default(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Cannot build a cache key from {type(value).__name__}")


class Cache:
    def __init__(self, redis: Redis, *, prefix: str = "cache", retry_after: float = 30.0) -> None:
        self.redis = redis
        self.prefix = prefix
        self.retry_after = retry_after
        self._unavailable_until = 0.0

    @property
    def available(self) -> bool:
        return time.monotonic() >= self._unavailable_until

    def _mark_unavailable(self, namespace: str, exc: Exception) -> None:
        self._unavailable_until = time.monotonic() + self.retry_after
        logger.warning(
            "cache_unavailable", namespace=namespace, error=str(exc), retry_after_s=self.retry_after
        )

    def _version_key(self, namespace: str) -> str:
        return f"{self.prefix}:{namespace}:version"

    async def get_or_load[T](
        self,
        namespace: str,
        key_parts: Any,
        ttl: int,
        loader: Callable[[], Awaitable[T]],
        adapter: TypeAdapter[T],
    ) -> T:
        if not self.available:
            return await loader()
        raw_parts = json.dumps(key_parts, default=_json_default, sort_keys=True)
        digest = hashlib.sha1(raw_parts.encode(), usedforsecurity=False).hexdigest()
        try:
            version = int(await self.redis.get(self._version_key(namespace)) or 0)
            key = f"{self.prefix}:{namespace}:v{version}:{digest}"
            cached = await self.redis.get(key)
        except (RedisError, OSError) as exc:
            self._mark_unavailable(namespace, exc)
            return await loader()

        if cached is not None:
            logger.debug("cache_hit", namespace=namespace, key=key)
            return adapter.validate_json(cached)

        logger.debug("cache_miss", namespace=namespace, key=key)
        value = await loader()
        try:
            await self.redis.set(key, adapter.dump_json(value), ex=ttl)
        except (RedisError, OSError) as exc:
            self._mark_unavailable(namespace, exc)
        return value

    async def invalidate(self, namespace: str) -> None:
        await self.redis.incr(self._version_key(namespace))


class CachedService(Protocol):
    cache: Cache
    settings: Settings


def cached[T](
    namespace: str, *, ttl_setting: str
) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        adapter: TypeAdapter[T] | None = None

        @wraps(func)
        async def wrapper(self: CachedService, *args: Any, **kwargs: Any) -> T:
            nonlocal adapter
            if adapter is None:
                adapter = TypeAdapter(get_type_hints(func)["return"])
            return await self.cache.get_or_load(
                namespace,
                [func.__qualname__, args, kwargs],
                getattr(self.settings, ttl_setting),
                lambda: func(self, *args, **kwargs),
                adapter,
            )

        return wrapper

    return decorator
