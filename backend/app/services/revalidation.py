from collections.abc import Sequence

import httpx
import structlog
from redis.exceptions import RedisError

from app.cache.decorators import Cache
from app.core.config import Settings

logger = structlog.get_logger(__name__)

REVALIDATE_PATH = "/api/revalidate"


class FrontendRevalidator:
    def __init__(self, client: httpx.AsyncClient, secret: str | None) -> None:
        self.client = client
        self.secret = secret

    async def revalidate(self, tags: Sequence[str]) -> None:
        if not self.secret:
            return
        try:
            response = await self.client.post(
                REVALIDATE_PATH,
                json={"tags": list(tags)},
                headers={"Authorization": f"Bearer {self.secret}"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.info("frontend_revalidation_failed", tags=list(tags), error=type(exc).__name__)

    async def aclose(self) -> None:
        await self.client.aclose()


def create_frontend_revalidator(settings: Settings) -> FrontendRevalidator:
    client = httpx.AsyncClient(
        base_url=settings.frontend_internal_url,
        timeout=settings.revalidate_timeout_seconds,
        trust_env=False,
    )
    secret = settings.revalidate_secret
    return FrontendRevalidator(client, secret.get_secret_value() if secret else None)


class ChangePublisher:
    def __init__(self, cache: Cache, revalidator: FrontendRevalidator) -> None:
        self.cache = cache
        self.revalidator = revalidator

    async def publish(self, *namespaces: str) -> None:
        if not namespaces:
            return
        for namespace in namespaces:
            try:
                await self.cache.invalidate(namespace)
            except (RedisError, OSError) as exc:
                logger.warning(
                    "cache_invalidation_failed", namespace=namespace, error=type(exc).__name__
                )
        await self.revalidator.revalidate(namespaces)
