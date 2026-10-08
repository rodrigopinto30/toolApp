"""Dependency providers. Routers depend on these; tests replace them with
`app.dependency_overrides`."""

from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.cache.decorators import Cache
from app.core.config import Settings
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.services.catalog import CatalogService
from app.services.pricing import PricingService
from app.services.shipping import ShippingService


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_engine(request: Request) -> AsyncEngine:
    return request.app.state.engine


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_session_factory(request: Request) -> async_sessionmaker[AsyncSession]:
    return request.app.state.session_factory


def get_uow(
    session_factory: Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)],
) -> SqlAlchemyUnitOfWork:
    return SqlAlchemyUnitOfWork(session_factory)


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
EngineDep = Annotated[AsyncEngine, Depends(get_engine)]
RedisDep = Annotated[Redis, Depends(get_redis)]
UnitOfWorkDep = Annotated[SqlAlchemyUnitOfWork, Depends(get_uow)]
SessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]


def get_cache(request: Request) -> Cache:
    return request.app.state.cache


CacheDep = Annotated[Cache, Depends(get_cache)]


def get_pricing_service(
    session_factory: SessionFactoryDep, cache: CacheDep, settings: SettingsDep
) -> PricingService:
    return PricingService(SqlAlchemyUnitOfWork(session_factory), cache, settings)


PricingServiceDep = Annotated[PricingService, Depends(get_pricing_service)]


def get_catalog_service(
    session_factory: SessionFactoryDep,
    cache: CacheDep,
    settings: SettingsDep,
    pricing: PricingServiceDep,
) -> CatalogService:
    return CatalogService(SqlAlchemyUnitOfWork(session_factory), cache, settings, pricing)


def get_shipping_service(
    session_factory: SessionFactoryDep, pricing: PricingServiceDep, settings: SettingsDep
) -> ShippingService:
    return ShippingService(SqlAlchemyUnitOfWork(session_factory), pricing, settings)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]
ShippingServiceDep = Annotated[ShippingService, Depends(get_shipping_service)]
