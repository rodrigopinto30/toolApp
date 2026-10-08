from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.api.v1 import api_router
from app.cache.decorators import Cache
from app.cache.redis import create_redis
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import (
    BodySizeLimitMiddleware,
    CacheControlMiddleware,
    RequestContextMiddleware,
    TimeoutMiddleware,
)
from app.db.session import create_engine, create_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.engine = create_engine(settings)
        app.state.session_factory = create_session_factory(app.state.engine)
        app.state.redis = create_redis(settings)
        app.state.cache = Cache(app.state.redis)
        try:
            yield
        finally:
            await app.state.redis.aclose()
            await app.state.engine.dispose()

    prefix = settings.api_prefix
    app = FastAPI(
        title="ToolApp API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=f"{prefix}/docs" if settings.is_dev else None,
        redoc_url=None,
        openapi_url=f"{prefix}/openapi.json" if settings.is_dev else None,
    )
    register_exception_handlers(app)

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(TimeoutMiddleware, timeout=settings.request_timeout_seconds)
    app.add_middleware(CacheControlMiddleware)
    app.add_middleware(
        RequestContextMiddleware,
        quiet_paths=frozenset({f"{prefix}/health/live", f"{prefix}/health/ready"}),
    )

    app.include_router(health.router, prefix=prefix)
    app.include_router(api_router, prefix=prefix)
    return app


app = create_app()
