"""python -m app.seed  (run by the "migrations" service after `alembic upgrade head`)."""

import asyncio

import structlog

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import create_engine, create_session_factory
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.seed import run_seed


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings)
    try:
        async with SqlAlchemyUnitOfWork(create_session_factory(engine)) as uow:
            report = await run_seed(uow.session, settings)
        structlog.get_logger("app.seed").info("seed_finished", **report)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
