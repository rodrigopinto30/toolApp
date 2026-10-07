from datetime import UTC, datetime

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError, StatementError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.db.base import Base
from app.models import Brand, ProductVariant
from tests.factories import build_address, make_province, make_user, make_variant

MYSQL_MAX_IDENTIFIER = 64


def test_constraint_and_index_names_fit_mysql_limit() -> None:
    too_long = []
    for table in Base.metadata.tables.values():
        items: list = [*table.constraints, *table.indexes]
        too_long += [str(item.name) for item in items if len(str(item.name)) > MYSQL_MAX_IDENTIFIER]
    assert too_long == []


async def test_database_has_every_model_table(connection: AsyncConnection) -> None:
    tables = await connection.run_sync(lambda conn: set(inspect(conn).get_table_names()))

    assert tables - {"alembic_version"} == set(Base.metadata.tables)


async def test_product_search_has_fulltext_index(connection: AsyncConnection) -> None:
    indexes = await connection.run_sync(
        lambda conn: inspect(conn).get_indexes("product_translations")
    )
    fulltext = [i for i in indexes if i["dialect_options"].get("mysql_prefix") == "FULLTEXT"]

    assert [index["column_names"] for index in fulltext] == [["name", "short_description"]]


async def test_stock_cannot_be_negative(session: AsyncSession) -> None:
    variant = await make_variant(session)
    variant.stock = -1

    with pytest.raises(DBAPIError, match="stock_non_negative"):
        await session.flush()


async def test_only_one_default_address_per_user(session: AsyncSession) -> None:
    user = await make_user(session)
    province = await make_province(session)
    session.add(build_address(user, province, is_default=True))
    session.add(build_address(user, province, is_default=False))
    await session.flush()

    session.add(build_address(user, province, is_default=True))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_variant_uses_optimistic_locking(session: AsyncSession) -> None:
    variant = await make_variant(session)
    assert variant.version == 1

    # Someone else updates the row behind the ORM's back.
    await session.execute(
        text("UPDATE product_variants SET version = version + 1 WHERE id = :id"), {"id": variant.id}
    )
    variant.stock = 10
    with pytest.raises(StaleDataError):
        await session.flush()


async def test_version_increments_on_update(session: AsyncSession) -> None:
    variant = await make_variant(session)
    variant.stock = 7
    await session.flush()

    assert variant.version == 2


async def test_timestamps_are_utc_aware(session: AsyncSession) -> None:
    session.add(Brand(slug="time-brand", name="Time"))
    await session.flush()
    session.expunge_all()

    brand = await session.scalar(select(Brand).where(Brand.slug == "time-brand"))
    assert brand.created_at.tzinfo is UTC
    assert brand.updated_at == brand.created_at  # same timestamp on insert
    assert abs((datetime.now(UTC) - brand.created_at).total_seconds()) < 60


async def test_naive_datetimes_are_rejected(session: AsyncSession) -> None:
    user = await make_user(session)
    user.last_login_at = datetime(2026, 1, 1, 12, 0)  # noqa: DTZ001 (naive on purpose)

    with pytest.raises(StatementError, match="Naive datetime"):
        await session.flush()


async def test_enum_columns_reject_unknown_values(session: AsyncSession) -> None:
    user = await make_user(session)

    with pytest.raises(DBAPIError, match="ck_users_role"):
        await session.execute(
            text("UPDATE users SET role = 'superuser' WHERE id = :id"), {"id": user.id}
        )


async def test_variant_lookup_by_sku(session: AsyncSession) -> None:
    variant = await make_variant(session)

    found = await session.scalar(select(ProductVariant).where(ProductVariant.sku == variant.sku))
    assert found is variant
