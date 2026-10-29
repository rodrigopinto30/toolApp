import re
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Request
from sqlalchemy import Connection, NullPool, select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.cache.decorators import Cache
from app.core.config import Settings, get_settings
from app.core.container import (
    get_cache,
    get_email_sender,
    get_key_prefix,
    get_payment_gateway,
    get_session_factory,
)
from app.core.security import CSRF_COOKIE, CSRF_HEADER
from app.email.sender import EmailMessage
from app.main import create_app
from app.models import Address, PickupPoint, User
from app.payments.circuit_breaker import CircuitBreaker
from app.payments.gateway import MockPaymentGateway, PaymentGateway
from app.seed import run_seed
from tests.factories import make_user
from tests.shopping import PASSWORD, address_for, login


@pytest.fixture(scope="session")
def settings() -> Settings:
    settings = get_settings()
    if not settings.mysql_database.endswith("_test"):
        pytest.exit("Refusing to run: MYSQL_DATABASE must end with '_test'. Use ./test.sh.", 2)
    return settings


def _alembic(connection: Connection, action: str, revision: str) -> None:
    config = Config("alembic.ini")
    config.attributes["connection"] = connection
    getattr(command, action)(config, revision)


@pytest.fixture(scope="session")
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    database = settings.mysql_database
    async with engine.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS `{database}`"))
        await conn.execute(text(f"CREATE DATABASE `{database}`"))
        await conn.execute(text(f"USE `{database}`"))
        for action, revision in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
            await conn.run_sync(_alembic, action, revision)
        await conn.commit()
    yield engine
    await engine.dispose()


@pytest.fixture
async def connection(engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with engine.connect() as conn:
        transaction = await conn.begin()
        yield conn
        await transaction.rollback()


@pytest.fixture
def session_factory(connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        autoflush=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
async def session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest.fixture(scope="session")
async def app(settings: Settings, engine: AsyncEngine) -> AsyncIterator[FastAPI]:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        yield app


@pytest.fixture
def cache(app: FastAPI) -> Cache:
    return Cache(app.state.redis, prefix=f"test:{uuid.uuid4().hex}")


@pytest.fixture
async def seeded(session: AsyncSession, settings: Settings) -> None:
    await run_seed(session, settings)


class Outbox:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.messages.append(message)

    def sent(self, template: str) -> list[EmailMessage]:
        return [message for message in self.messages if message.template == template]

    def token(self, template: str) -> str:
        match = re.search(r"token=([A-Za-z0-9_-]+)", self.sent(template)[-1].text)
        assert match, f"no token in the last {template} email"
        return match.group(1)


@pytest.fixture
def outbox() -> Outbox:
    return Outbox()


@pytest.fixture
def key_prefix() -> str:
    return f"test:{uuid.uuid4().hex}"


@pytest.fixture
def raw_client_factory(
    app: FastAPI,
    session_factory: async_sessionmaker[AsyncSession],
    cache: Cache,
    outbox: Outbox,
    key_prefix: str,
) -> Iterator[Callable[..., AsyncClient]]:
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    app.dependency_overrides[get_cache] = lambda: cache
    app.dependency_overrides[get_email_sender] = lambda: outbox
    app.dependency_overrides[get_key_prefix] = lambda: key_prefix

    def factory(**kwargs: Any) -> AsyncClient:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        return AsyncClient(transport=transport, base_url="https://test", **kwargs)

    yield factory
    app.dependency_overrides.clear()


@pytest.fixture
async def raw_client(raw_client_factory: Callable[..., AsyncClient]) -> AsyncIterator[AsyncClient]:
    async with raw_client_factory() as client:
        yield client


@pytest.fixture
async def client(raw_client_factory: Callable[..., AsyncClient]) -> AsyncIterator[AsyncClient]:
    async def add_csrf_header(request: Request) -> None:
        token = client.cookies.get(CSRF_COOKIE)
        if token and CSRF_HEADER not in request.headers:
            request.headers[CSRF_HEADER] = token

    async with raw_client_factory(event_hooks={"request": [add_csrf_header]}) as client:
        await client.get("/api/v1/auth/csrf")
        yield client


@pytest.fixture
async def customer(client: AsyncClient, session: AsyncSession) -> User:
    user = await make_user(session, password=PASSWORD, verified=True)
    await login(client, user)
    return user


@pytest.fixture
async def address(session: AsyncSession, customer: User) -> Address:
    return await address_for(session, customer)


@pytest.fixture
async def pickup_point_id(session: AsyncSession) -> int:
    return await session.scalar(select(PickupPoint.id))


@pytest.fixture
def payment_clock() -> list[float]:
    return [0.0]


@pytest.fixture
def gateway(app: FastAPI, client: AsyncClient, payment_clock: list[float]) -> PaymentGateway:
    breaker = CircuitBreaker(
        failure_threshold=3, reset_seconds=30, clock=lambda: payment_clock[0]
    )
    gateway = PaymentGateway(MockPaymentGateway(slow_seconds=1), breaker, timeout_seconds=0.05)
    app.dependency_overrides[get_payment_gateway] = lambda: gateway
    return gateway
