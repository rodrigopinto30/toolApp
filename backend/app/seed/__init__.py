"""Idempotent seed: each section only runs if its table is empty, so it is safe to run on
every start (the "migrations" service does). It never commits; the caller does."""

from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.repositories.base import SqlAlchemyRepository
from app.db.types import utcnow
from app.models import (
    Attribute,
    AttributeValue,
    Brand,
    Category,
    ExchangeRate,
    Locale,
    PickupPoint,
    Product,
    ProductTranslation,
    ProductVariant,
    Province,
    ShippingZone,
    User,
    UserRole,
)
from app.seed import data

logger = structlog.get_logger(__name__)

POWER_TOOL_CATEGORIES = {"drills", "angle-grinders", "saws"}


async def run_seed(session: AsyncSession, settings: Settings) -> dict[str, Any]:
    """Seeds what is missing and returns what was done, per section."""
    report: dict[str, Any] = {
        "shipping": await _seed_shipping(session),
        "pickup_points": await _seed_pickup_points(session),
        "admin": await _seed_admin(session, settings),
        "catalog": await _seed_catalog(session),
    }
    report["exchange_rate"] = await _seed_exchange_rate(session, settings)
    await session.flush()
    return report


def _repo[ModelT: Base](session: AsyncSession, model: type[ModelT]) -> SqlAlchemyRepository[ModelT]:
    return SqlAlchemyRepository(session, model)


async def _seed_shipping(session: AsyncSession) -> str:
    if await _repo(session, ShippingZone).exists():
        return "skipped"
    zones = {
        code: ShippingZone(
            code=code,
            name=name,
            cost_usd=Decimal(cost),
            free_over_usd=Decimal(free_over),
            eta_min_days=eta_min,
            eta_max_days=eta_max,
        )
        for code, (name, cost, free_over, eta_min, eta_max) in data.SHIPPING_ZONES.items()
    }
    session.add_all(zones.values())
    session.add_all(
        Province(code=code, name=name, zone=zones[zone_code])
        for code, (name, zone_code) in data.PROVINCES.items()
    )
    return f"{len(zones)} zones, {len(data.PROVINCES)} provinces"


async def _seed_pickup_points(session: AsyncSession) -> str:
    if await _repo(session, PickupPoint).exists():
        return "skipped"
    session.add_all(PickupPoint(**point) for point in data.PICKUP_POINTS)
    return f"{len(data.PICKUP_POINTS)} pickup points"


async def _seed_admin(session: AsyncSession, settings: Settings) -> str:
    if not settings.admin_email or settings.admin_password is None:
        logger.warning("seed_admin_skipped", reason="ADMIN_EMAIL or ADMIN_PASSWORD not set")
        return "skipped (not configured)"
    email = settings.admin_email.strip().lower()
    if await _repo(session, User).exists(email=email):
        return "skipped"
    session.add(
        User(
            email=email,
            password_hash=hash_password(settings.admin_password.get_secret_value()),
            first_name="Admin",
            last_name="ToolApp",
            role=UserRole.ADMIN,
            email_verified_at=utcnow(),
        )
    )
    return f"created {email}"


async def _seed_catalog(session: AsyncSession) -> str:
    if await _repo(session, Category).exists():
        return "skipped"

    categories: dict[str, Category] = {}
    for position, (slug, (name, children)) in enumerate(data.CATEGORIES.items()):
        parent = Category(slug=slug, name=name, position=position)
        categories[slug] = parent
        for child_position, (child_slug, child_name) in enumerate(children.items()):
            categories[child_slug] = Category(
                slug=child_slug, name=child_name, position=child_position, parent=parent
            )

    brands = {slug: Brand(slug=slug, name=name) for slug, name in data.BRANDS.items()}

    values: dict[tuple[str, str], AttributeValue] = {}
    attributes: list[Attribute] = []
    for code, (name, attribute_values) in data.ATTRIBUTES.items():
        attribute = Attribute(code=code, name=name)
        attributes.append(attribute)
        for position, (slug, label) in enumerate(attribute_values.items()):
            values[(code, slug)] = AttributeValue(
                attribute=attribute, slug=slug, value=label, position=position
            )

    products = [_build_product(item, categories, brands, values) for item in data.PRODUCTS]
    session.add_all([*categories.values(), *brands.values(), *attributes, *products])
    return (
        f"{len(categories)} categories, {len(brands)} brands, "
        f"{len(attributes)} attributes, {len(products)} products"
    )


def _build_product(
    item: dict[str, Any],
    categories: dict[str, Category],
    brands: dict[str, Brand],
    values: dict[tuple[str, str], AttributeValue],
) -> Product:
    warranty_months = 12 if item["category"] in POWER_TOOL_CATEGORIES else 6
    product = Product(
        slug=item["slug"],
        brand=brands[item["brand"]],
        category=categories[item["category"]],
        is_featured=item["featured"],
    )
    product.translations = []
    for locale in Locale:
        sentence, spec_label, spec_value = data.WARRANTY_TEXT[locale]
        product.translations.append(
            ProductTranslation(
                locale=locale,
                name=item["name"][locale],
                short_description=item["short"][locale],
                description=f"{item['short'][locale]} {sentence.format(months=warranty_months)}",
                specs={spec_label: spec_value.format(months=warranty_months)},
            )
        )
    product.variants = [
        ProductVariant(
            sku=sku,
            price_usd=Decimal(price),
            compare_at_price_usd=Decimal(compare_at) if compare_at else None,
            stock=stock,
            position=position,
            attribute_values=[values[(code, slug)] for code, slug in attrs.items()],
        )
        for position, (sku, price, compare_at, stock, attrs) in enumerate(item["variants"])
    ]
    return product


async def _seed_exchange_rate(session: AsyncSession, settings: Settings) -> str:
    if await _repo(session, ExchangeRate).exists():
        return "skipped"
    await session.flush()  # the admin (if created above) needs its id
    admin = None
    if settings.admin_email:
        admin = await _repo(session, User).get_by(email=settings.admin_email.strip().lower())
    session.add(
        ExchangeRate(rate=data.INITIAL_EXCHANGE_RATE, created_by=admin.id if admin else None)
    )
    return f"{data.INITIAL_EXCHANGE_RATE} ARS/USD"
