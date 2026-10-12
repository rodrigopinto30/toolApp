from collections.abc import Iterator
from contextlib import contextmanager

import structlog
from redis.exceptions import RedisError

from app.core.exceptions import ServiceUnavailableError

logger = structlog.get_logger(__name__)


@contextmanager
def redis_required() -> Iterator[None]:
    try:
        yield
    except (RedisError, OSError) as exc:
        logger.warning("auth_store_unavailable", error=str(exc))
        raise ServiceUnavailableError(
            "Authentication is temporarily unavailable.", code="auth_unavailable"
        ) from exc
