import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Brand


async def test_commits_when_block_succeeds(
    session_factory: async_sessionmaker[AsyncSession], session: AsyncSession
) -> None:
    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        uow.repository(Brand).add(Brand(slug="acme", name="Acme"))

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        assert await uow.repository(Brand).exists(slug="acme")


async def test_rolls_back_when_block_raises(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with pytest.raises(RuntimeError):
        async with SqlAlchemyUnitOfWork(session_factory) as uow:
            uow.repository(Brand).add(Brand(slug="ghost", name="Ghost"))
            await uow.flush()
            raise RuntimeError("abort")

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        assert not await uow.repository(Brand).exists(slug="ghost")


async def test_session_is_only_available_inside_the_block(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    uow = SqlAlchemyUnitOfWork(session_factory)

    with pytest.raises(RuntimeError):
        _ = uow.session


async def test_repository_queries(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        brands = uow.repository(Brand)
        brands.add_all([Brand(slug="b-one", name="One"), Brand(slug="b-two", name="Two", is_active=False)])
        await uow.flush()

        assert uow.repository(Brand) is brands
        assert (await brands.get_by(slug="b-two")).name == "Two"
        assert await brands.get_by(slug="missing") is None
        assert await brands.count(is_active=False) == 1
        listed = await brands.list(order_by=[Brand.slug.desc()], limit=1)
        assert [brand.slug for brand in listed] == ["b-two"]
        one = await brands.get_by(slug="b-one")
        assert (await brands.get(one.id)) is one

        await brands.delete(one)
        await uow.flush()
        assert not await brands.exists(slug="b-one")
