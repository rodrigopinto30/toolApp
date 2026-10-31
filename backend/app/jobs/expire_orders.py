import asyncio
import signal
from collections.abc import Awaitable, Callable
from contextlib import suppress
from pathlib import Path

import structlog

from app.cache.decorators import Cache
from app.cache.redis import create_redis
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import create_engine, create_session_factory
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.email.sender import EmailMessage, create_email_sender, deliver
from app.services.order_expiry import OrderExpiry
from app.services.revalidation import ChangePublisher, create_frontend_revalidator

HEARTBEAT = Path("/tmp/worker-heartbeat")

logger = structlog.get_logger(__name__)


async def run_cycles(
    cycle: Callable[[], Awaitable[None]],
    *,
    interval: float,
    stop: asyncio.Event,
    heartbeat: Path,
) -> None:
    while not stop.is_set():
        try:
            await cycle()
            heartbeat.touch()
        except Exception:
            logger.exception("worker_cycle_failed")
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), interval)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings)
    redis = create_redis(settings)
    revalidator = create_frontend_revalidator(settings)
    sender = create_email_sender(settings)
    outgoing: list[EmailMessage] = []
    expiry = OrderExpiry(
        SqlAlchemyUnitOfWork(create_session_factory(engine)),
        Mailer(settings, outgoing.append),
        ChangePublisher(Cache(redis), revalidator),
        settings.pending_order_ttl_minutes,
    )

    async def cycle() -> None:
        await expiry.run()
        while outgoing:
            await deliver(sender, outgoing.pop(0))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop.set)
    logger.info("worker_started", ttl_minutes=settings.pending_order_ttl_minutes)
    try:
        await run_cycles(
            cycle,
            interval=settings.order_expiry_interval_seconds,
            stop=stop,
            heartbeat=HEARTBEAT,
        )
    finally:
        await revalidator.aclose()
        await redis.aclose()
        await engine.dispose()
    logger.info("worker_stopped")


if __name__ == "__main__":
    asyncio.run(main())
