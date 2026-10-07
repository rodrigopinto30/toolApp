"""Minimal valid entities for tests. Each call uses unique slugs/emails."""

from decimal import Decimal
from itertools import count

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Address,
    Category,
    Product,
    ProductVariant,
    Province,
    ShippingZone,
    User,
)

_sequence = count(1)


async def make_user(session: AsyncSession) -> User:
    n = next(_sequence)
    user = User(email=f"user{n}@example.com", password_hash="x", first_name="Ana", last_name="Diaz")
    session.add(user)
    await session.flush()
    return user


async def make_variant(session: AsyncSession, *, stock: int = 5) -> ProductVariant:
    n = next(_sequence)
    category = Category(slug=f"category-{n}", name={"es": "Categoría", "en": "Category"})
    product = Product(slug=f"product-{n}", category=category)
    variant = ProductVariant(product=product, sku=f"SKU-{n}", price_usd=Decimal("10.00"), stock=stock)
    session.add(variant)
    await session.flush()
    return variant


async def make_province(session: AsyncSession) -> Province:
    n = next(_sequence)
    zone = ShippingZone(
        code=f"zone-{n}",
        name={"es": "Zona", "en": "Zone"},
        cost_usd=Decimal("5.00"),
        eta_min_days=1,
        eta_max_days=3,
    )
    province = Province(code=f"T-{n}", name="Test", zone=zone)
    session.add(province)
    await session.flush()
    return province


def build_address(user: User, province: Province, *, is_default: bool) -> Address:
    return Address(
        user_id=user.id,
        label="Home",
        recipient_name="Ana Diaz",
        phone="1155555555",
        street="Calle Falsa",
        number="123",
        city="CABA",
        province_id=province.id,
        postal_code="1000",
        is_default=is_default,
    )
