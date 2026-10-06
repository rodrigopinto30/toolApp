from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.cache.redis import create_redis
from app.core.config import Settings, get_settings
from app.db.session import create_engine, create_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # One pool per process: created on startup and closed on shutdown.
        app.state.settings = settings
        app.state.engine = create_engine(settings)
        app.state.session_factory = create_session_factory(app.state.engine)
        app.state.redis = create_redis(settings)
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
    app.include_router(health.router, prefix=prefix)
    return app


app = create_app()
