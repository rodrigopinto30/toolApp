import uuid
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from redis.asyncio import Redis

from app.auth.sessions import RefreshSessionStore
from app.auth.tokens import OneTimeTokenStore, TokenPurpose
from app.core.config import Settings
from app.core.exceptions import ConflictError, ServiceUnavailableError, UnauthorizedError

StoreFactory = Callable[..., RefreshSessionStore]


@pytest.fixture
def make_store(app: FastAPI, settings: Settings) -> StoreFactory:
    prefix = f"test:{uuid.uuid4().hex}"

    def factory(**overrides: object) -> RefreshSessionStore:
        updated = settings.model_copy(update=overrides)
        return RefreshSessionStore(app.state.redis, updated, prefix=prefix)

    return factory


async def test_rotation_issues_a_new_token_in_the_same_family(make_store: StoreFactory) -> None:
    store = make_store()
    session = await store.create(1)

    rotated = await store.rotate(session.refresh_token)

    assert rotated.family_id == session.family_id
    assert rotated.refresh_token != session.refresh_token
    assert (await store.rotate(rotated.refresh_token)).user_id == 1


async def test_reuse_within_grace_is_a_conflict(make_store: StoreFactory) -> None:
    store = make_store()
    session = await store.create(1)
    rotated = await store.rotate(session.refresh_token)

    with pytest.raises(ConflictError):
        await store.rotate(session.refresh_token)
    assert (await store.rotate(rotated.refresh_token)).family_id == session.family_id


async def test_reuse_after_grace_revokes_the_family(make_store: StoreFactory) -> None:
    store = make_store(refresh_reuse_grace=-1)
    session = await store.create(1)
    rotated = await store.rotate(session.refresh_token)

    with pytest.raises(UnauthorizedError):
        await store.rotate(session.refresh_token)
    with pytest.raises(UnauthorizedError):
        await store.rotate(rotated.refresh_token)


async def test_unknown_token(make_store: StoreFactory) -> None:
    with pytest.raises(UnauthorizedError):
        await make_store().rotate("does-not-exist")


async def test_family_expiry_caps_the_token(make_store: StoreFactory, app: FastAPI) -> None:
    store = make_store()
    session = await store.create(1)
    await app.state.redis.expire(store._family_key(session.family_id), 100)

    rotated = await store.rotate(session.refresh_token)

    assert 0 < await app.state.redis.ttl(store._token_key(rotated.refresh_token)) <= 100


async def test_revoke_user_ends_every_session(make_store: StoreFactory) -> None:
    store = make_store()
    first, second, other = await store.create(1), await store.create(1), await store.create(2)

    await store.revoke_user(1)

    for session in (first, second):
        with pytest.raises(UnauthorizedError):
            await store.rotate(session.refresh_token)
    assert (await store.rotate(other.refresh_token)).user_id == 2


async def test_one_time_tokens(app: FastAPI) -> None:
    store = OneTimeTokenStore(app.state.redis, prefix=f"test:{uuid.uuid4().hex}")
    old = await store.issue(TokenPurpose.RESET_PASSWORD, 5, 60)
    new = await store.issue(TokenPurpose.RESET_PASSWORD, 5, 60)

    assert await store.consume(TokenPurpose.RESET_PASSWORD, old) is None
    assert await store.consume(TokenPurpose.VERIFY_EMAIL, new) is None
    assert await store.consume(TokenPurpose.RESET_PASSWORD, new) == 5
    assert await store.consume(TokenPurpose.RESET_PASSWORD, new) is None


async def test_store_unavailable_without_redis(settings: Settings) -> None:
    redis = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2)
    store = RefreshSessionStore(redis, settings, prefix="test")

    with pytest.raises(ServiceUnavailableError):
        await store.create(1)
    await redis.aclose()
