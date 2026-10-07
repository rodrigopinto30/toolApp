from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import verify_password
from app.models import (
    Category,
    ExchangeRate,
    PickupPoint,
    Product,
    ProductTranslation,
    ProductVariant,
    Province,
    ShippingZone,
    User,
    UserRole,
)
from app.seed import run_seed

COUNTED = (ShippingZone, Province, PickupPoint, Category, Product, ProductVariant, ExchangeRate, User)


def _with_admin(settings: Settings) -> Settings:
    return settings.model_copy(
        update={"admin_email": "Admin@Example.com", "admin_password": SecretStr("s3cret-pass")}
    )


async def _counts(session: AsyncSession) -> dict[str, int]:
    return {
        model.__name__: await session.scalar(select(func.count()).select_from(model))
        for model in COUNTED
    }


async def test_seed_loads_initial_data(session: AsyncSession, settings: Settings) -> None:
    await run_seed(session, _with_admin(settings))

    counts = await _counts(session)
    assert counts["ShippingZone"] == 4
    assert counts["Province"] == 24
    assert counts["PickupPoint"] == 1
    assert counts["Product"] >= 20
    assert counts["ExchangeRate"] == 1
    top_level = await session.scalar(
        select(func.count()).select_from(Category).where(Category.parent_id.is_(None))
    )
    assert top_level == 6


async def test_every_product_has_both_locales_and_variants(
    session: AsyncSession, settings: Settings
) -> None:
    await run_seed(session, settings)

    products = await session.scalars(
        select(Product).options(selectinload(Product.translations), selectinload(Product.variants))
    )
    for product in products:
        assert {t.locale for t in product.translations} == {"es", "en"}, product.slug
        assert product.variants, product.slug
    translations = await session.scalar(select(func.count()).select_from(ProductTranslation))
    assert translations == 2 * await session.scalar(select(func.count()).select_from(Product))


async def test_seed_creates_admin(session: AsyncSession, settings: Settings) -> None:
    await run_seed(session, _with_admin(settings))

    admin = await session.scalar(select(User).where(User.email == "admin@example.com"))
    assert admin.role == UserRole.ADMIN
    assert admin.email_verified_at is not None
    assert verify_password(admin.password_hash, "s3cret-pass")
    rate = await session.scalar(select(ExchangeRate))
    assert rate.created_by == admin.id


async def test_seed_is_idempotent(session: AsyncSession, settings: Settings) -> None:
    await run_seed(session, _with_admin(settings))
    first = await _counts(session)

    report = await run_seed(session, _with_admin(settings))

    assert await _counts(session) == first
    assert set(report.values()) == {"skipped"}


async def test_seed_without_admin_settings_skips_admin(
    session: AsyncSession, settings: Settings
) -> None:
    report = await run_seed(
        session, settings.model_copy(update={"admin_email": None, "admin_password": None})
    )

    assert report["admin"].startswith("skipped")
    assert await session.scalar(select(func.count()).select_from(User)) == 0
