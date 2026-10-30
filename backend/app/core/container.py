from typing import Annotated

from fastapi import BackgroundTasks, Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.auth.rate_limit import LoginLockout, RateLimiter
from app.auth.sessions import RefreshSessionStore
from app.auth.tokens import OneTimeTokenStore
from app.cache.decorators import Cache
from app.core.config import Settings
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.email.sender import EmailMessage, EmailSender, deliver
from app.media.storage import ImageStorage
from app.payments.gateway import PaymentGateway
from app.services.account import AccountService
from app.services.auth import AuthService
from app.services.cart import CartService
from app.services.catalog import CatalogService
from app.services.checkout import CheckoutService
from app.services.orders import OrderService
from app.services.pricing import PricingService
from app.services.revalidation import ChangePublisher, FrontendRevalidator
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


def get_frontend_revalidator(request: Request) -> FrontendRevalidator:
    return request.app.state.frontend_revalidator


def get_change_publisher(
    cache: CacheDep,
    revalidator: Annotated[FrontendRevalidator, Depends(get_frontend_revalidator)],
) -> ChangePublisher:
    return ChangePublisher(cache, revalidator)


ChangePublisherDep = Annotated[ChangePublisher, Depends(get_change_publisher)]


def get_image_storage(request: Request) -> ImageStorage:
    return request.app.state.image_storage


ImageStorageDep = Annotated[ImageStorage, Depends(get_image_storage)]


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


def get_cart_service(
    session_factory: SessionFactoryDep, pricing: PricingServiceDep, settings: SettingsDep
) -> CartService:
    return CartService(SqlAlchemyUnitOfWork(session_factory), pricing, settings)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]
ShippingServiceDep = Annotated[ShippingService, Depends(get_shipping_service)]
CartServiceDep = Annotated[CartService, Depends(get_cart_service)]


def get_key_prefix() -> str:
    return "auth"


KeyPrefixDep = Annotated[str, Depends(get_key_prefix)]


def get_rate_limiter(redis: RedisDep, prefix: KeyPrefixDep) -> RateLimiter:
    return RateLimiter(redis, prefix=f"{prefix}:rate")


def get_login_lockout(redis: RedisDep, settings: SettingsDep, prefix: KeyPrefixDep) -> LoginLockout:
    return LoginLockout(
        redis,
        prefix=f"{prefix}:lockout",
        max_failures=settings.login_max_failures,
        lockout_seconds=settings.login_lockout_seconds,
    )


def get_session_store(
    redis: RedisDep, settings: SettingsDep, prefix: KeyPrefixDep
) -> RefreshSessionStore:
    return RefreshSessionStore(redis, settings, prefix=prefix)


def get_token_store(redis: RedisDep, prefix: KeyPrefixDep) -> OneTimeTokenStore:
    return OneTimeTokenStore(redis, prefix=f"{prefix}:token")


RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]
SessionStoreDep = Annotated[RefreshSessionStore, Depends(get_session_store)]


def get_email_sender(request: Request) -> EmailSender:
    return request.app.state.email_sender


def get_mailer(
    background_tasks: BackgroundTasks,
    sender: Annotated[EmailSender, Depends(get_email_sender)],
    settings: SettingsDep,
) -> Mailer:
    def schedule(message: EmailMessage) -> None:
        background_tasks.add_task(deliver, sender, message)

    return Mailer(settings, schedule)


MailerDep = Annotated[Mailer, Depends(get_mailer)]


def get_auth_service(
    session_factory: SessionFactoryDep,
    sessions: SessionStoreDep,
    tokens: Annotated[OneTimeTokenStore, Depends(get_token_store)],
    lockout: Annotated[LoginLockout, Depends(get_login_lockout)],
    limiter: RateLimiterDep,
    mailer: MailerDep,
    settings: SettingsDep,
) -> AuthService:
    return AuthService(
        SqlAlchemyUnitOfWork(session_factory), sessions, tokens, lockout, limiter, mailer, settings
    )


def get_account_service(
    session_factory: SessionFactoryDep,
    sessions: SessionStoreDep,
    mailer: MailerDep,
    settings: SettingsDep,
) -> AccountService:
    return AccountService(SqlAlchemyUnitOfWork(session_factory), sessions, mailer, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
AccountServiceDep = Annotated[AccountService, Depends(get_account_service)]


def get_payment_gateway(request: Request) -> PaymentGateway:
    return request.app.state.payment_gateway


PaymentGatewayDep = Annotated[PaymentGateway, Depends(get_payment_gateway)]


def get_checkout_service(
    session_factory: SessionFactoryDep,
    pricing: PricingServiceDep,
    gateway: PaymentGatewayDep,
    limiter: RateLimiterDep,
    mailer: MailerDep,
    settings: SettingsDep,
) -> CheckoutService:
    return CheckoutService(
        SqlAlchemyUnitOfWork(session_factory), pricing, gateway, limiter, mailer, settings
    )


CheckoutServiceDep = Annotated[CheckoutService, Depends(get_checkout_service)]


def get_order_service(
    session_factory: SessionFactoryDep,
    gateway: PaymentGatewayDep,
    mailer: MailerDep,
) -> OrderService:
    return OrderService(SqlAlchemyUnitOfWork(session_factory), gateway, mailer)


OrderServiceDep = Annotated[OrderService, Depends(get_order_service)]
