import json

import httpx
import pytest
from pydantic import SecretStr
from redis.exceptions import ConnectionError as RedisConnectionError

from app.cache.decorators import Cache
from app.core.config import Settings
from app.services.revalidation import (
    ChangePublisher,
    FrontendRevalidator,
    create_frontend_revalidator,
)
from tests.conftest import RevalidationLog


def revalidator(
    handler: httpx.MockTransport, secret: str | None = "shared-secret"
) -> FrontendRevalidator:
    client = httpx.AsyncClient(base_url="http://frontend:3000", transport=handler)
    return FrontendRevalidator(client, secret)


async def test_posts_the_tags_with_the_secret() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200)

    await revalidator(httpx.MockTransport(handler)).revalidate(("pricing", "shipping"))

    assert len(requests) == 1
    assert str(requests[0].url) == "http://frontend:3000/api/revalidate"
    assert requests[0].headers["Authorization"] == "Bearer shared-secret"
    assert json.loads(requests[0].content) == {"tags": ["pricing", "shipping"]}


async def test_without_a_secret_nothing_is_sent() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    await revalidator(httpx.MockTransport(handler), None).revalidate(("pricing",))


@pytest.mark.parametrize("status", [404, 500, 307])
async def test_a_bad_answer_never_fails_the_caller(status: int) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(status))

    await revalidator(transport).revalidate(("pricing",))


async def test_an_unreachable_frontend_never_fails_the_caller() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("no answer", request=request)

    await revalidator(httpx.MockTransport(handler)).revalidate(("pricing",))


@pytest.mark.parametrize("secret", [None, SecretStr("")])
async def test_an_empty_secret_counts_as_not_configured(
    settings: Settings, secret: SecretStr | None
) -> None:
    created = create_frontend_revalidator(settings.model_copy(update={"revalidate_secret": secret}))

    assert created.secret is None
    await created.aclose()


async def test_publish_invalidates_each_namespace_and_revalidates_them(cache: Cache) -> None:
    log = RevalidationLog()
    before = await cache.redis.get(cache._version_key("pricing"))

    await ChangePublisher(cache, log).publish("pricing", "shipping")

    assert await cache.redis.get(cache._version_key("pricing")) != before
    assert log.tags == [["pricing", "shipping"]]


async def test_publish_without_namespaces_does_nothing(cache: Cache) -> None:
    log = RevalidationLog()

    await ChangePublisher(cache, log).publish()

    assert log.tags == []


async def test_publish_survives_a_redis_failure() -> None:
    class BrokenCache:
        async def invalidate(self, namespace: str) -> None:
            raise RedisConnectionError("down")

    log = RevalidationLog()

    await ChangePublisher(BrokenCache(), log).publish("pricing")

    assert log.tags == [["pricing"]]
