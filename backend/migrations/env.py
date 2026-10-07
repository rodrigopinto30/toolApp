"""Alembic environment (async). Run with the migrator user (DDL privileges).

The tests pass an already open sync connection in `config.attributes["connection"]`
so migrations run inside the test database setup.
"""

import asyncio
from typing import Any

from alembic import context
from alembic.autogenerate.api import AutogenContext
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import create_async_engine

import app.models
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.types import UtcDateTime

config = context.config
target_metadata = Base.metadata


def render_item(type_: str, obj: Any, autogen_context: AutogenContext) -> str | bool:
    if type_ == "type" and isinstance(obj, UtcDateTime):
        autogen_context.imports.add("from sqlalchemy.dialects import mysql")
        return "mysql.DATETIME(fsp=6)"
    return False


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_item=render_item,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(get_settings().database_url, poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) mode is not supported.")

connection = config.attributes.get("connection")
if connection is not None:
    do_run_migrations(connection)
else:
    configure_logging(get_settings().log_level)
    asyncio.run(run_async_migrations())
