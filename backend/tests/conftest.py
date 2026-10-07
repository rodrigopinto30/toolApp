"""Test setup. Run through ./test.sh, which points MYSQL_DATABASE at "<database>_test".

- Once per session: the test database is recreated and the migrations run
  (upgrade -> downgrade -> upgrade, so downgrades are tested too).
- Each test runs inside a transaction that is rolled back at the end; sessions use
  SAVEPOINTs, so code that commits (the Unit of Work) works without leaking data.
"""

from collections.abc import AsyncIterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Connection, NullPool, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.core.container import get_session_factory
from app.main import create_app


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
async def client(
    app: FastAPI, session_factory: async_sessionmaker[AsyncSession]
) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
