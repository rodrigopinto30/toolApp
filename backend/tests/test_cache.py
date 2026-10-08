import time
import uuid

from httpx import AsyncClient
from pydantic import TypeAdapter
from redis.asyncio import Redis

from app.cache.decorators import Cache

ADAPTER = TypeAdapter(list[int])


class Loader:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> list[int]:
        self.calls += 1
        return [self.calls]


async def test_second_call_is_served_from_cache(cache: Cache) -> None:
    loader = Loader()

    first = await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER)
    second = await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER)

    assert first == second == [1]
    assert loader.calls == 1


async def test_different_keys_do_not_collide(cache: Cache) -> None:
    loader = Loader()

    await cache.get_or_load("ns", ["a"], 60, loader, ADAPTER)
    await cache.get_or_load("ns", ["b"], 60, loader, ADAPTER)

    assert loader.calls == 2


async def test_invalidate_drops_the_whole_namespace(cache: Cache) -> None:
    loader, other = Loader(), Loader()
    await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER)
    await cache.get_or_load("other", ["key"], 60, other, ADAPTER)

    await cache.invalidate("ns")

    assert await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER) == [2]
    assert await cache.get_or_load("other", ["key"], 60, other, ADAPTER) == [1]


async def test_falls_back_to_loader_when_redis_is_down() -> None:
    redis = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2, socket_timeout=0.2)
    cache = Cache(redis, prefix=f"test:{uuid.uuid4().hex}")
    loader = Loader()

    assert await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER) == [1]
    assert not cache.available
    started = time.monotonic()
    assert await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER) == [2]
    assert time.monotonic() - started < 0.1
    await redis.aclose()


async def test_retries_redis_after_the_pause(cache: Cache) -> None:
    cache._unavailable_until = time.monotonic() - 1
    loader = Loader()

    await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER)
    await cache.get_or_load("ns", ["key"], 60, loader, ADAPTER)

    assert cache.available
    assert loader.calls == 1


async def test_catalog_responses_are_cached(
    client: AsyncClient, cache: Cache, seeded: None
) -> None:
    first = await client.get("/api/v1/brands")
    keys = [key async for key in cache.redis.scan_iter(f"{cache.prefix}:catalog:*")]

    assert first.status_code == 200
    assert len(keys) == 1
