from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings
from app.db.base import Base
from app.seed import run_seed

DRILLS = {
    "bosch-cordless-hammer-drill-18v",
    "makita-hammer-drill",
    "dewalt-drill-driver-20v",
    "black-decker-drill-driver-12v",
}


@pytest.fixture(scope="module", autouse=True)
async def committed_catalog(engine: AsyncEngine, settings: Settings) -> AsyncIterator[None]:
    # InnoDB FULLTEXT indexes only see committed rows, so these tests cannot use the
    # per-test rollback: the seed is committed once and the tables are emptied afterwards.
    async with AsyncSession(engine) as session:
        await run_seed(session, settings)
        await session.commit()
    yield
    async with engine.connect() as conn:
        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in Base.metadata.sorted_tables:
            await conn.execute(text(f"TRUNCATE TABLE `{table.name}`"))
        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))


async def _slugs(client: AsyncClient, **params: object) -> set[str]:
    response = await client.get("/api/v1/products", params={"currency": "USD", **params})
    assert response.status_code == 200, response.text
    return {item["slug"] for item in response.json()["items"]}


async def test_search_uses_the_requested_locale(client: AsyncClient) -> None:
    assert await _slugs(client, q="taladro", locale="es") == DRILLS
    assert await _slugs(client, q="drill", locale="en") == DRILLS
    assert await _slugs(client, q="taladro", locale="en") == set()


async def test_search_matches_word_prefixes(client: AsyncClient) -> None:
    assert await _slugs(client, q="talad") == DRILLS


async def test_all_words_are_required(client: AsyncClient) -> None:
    assert await _slugs(client, q="taladro percutor") == {
        "bosch-cordless-hammer-drill-18v",
        "makita-hammer-drill",
    }


async def test_boolean_operators_in_the_query_are_ignored(client: AsyncClient) -> None:
    assert await _slugs(client, q='+taladro* "(') == DRILLS
    assert await _slugs(client, q="taladro -percutor") == {
        "bosch-cordless-hammer-drill-18v",
        "makita-hammer-drill",
    }


async def test_search_is_sorted_by_relevance_and_combines_with_filters(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/products", params={"q": "drill", "locale": "en", "brand": "bosch", "currency": "USD"}
    )

    assert [item["slug"] for item in response.json()["items"]] == ["bosch-cordless-hammer-drill-18v"]
