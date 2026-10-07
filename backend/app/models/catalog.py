from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.types import BigIntPk, UsdAmount, enum_check, str_enum

# Short labels are stored as {"es": "...", "en": "..."} in a JSON column.
I18nLabel = dict[str, str]


class Locale(StrEnum):
    ES = "es"
    EN = "en"


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[BigIntPk]
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id"), index=True
    )  # tree of up to 3 levels (enforced by the service)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[I18nLabel] = mapped_column(JSON)
    description: Mapped[I18nLabel | None] = mapped_column(JSON)
    image_path: Mapped[str | None] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())

    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side="Category.id", lazy="raise"
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent", lazy="raise")


class Brand(TimestampMixin, Base):
    __tablename__ = "brands"

    id: Mapped[BigIntPk]
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    logo_path: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_category_id_is_active", "category_id", "is_active"),
        Index("ix_products_is_featured_is_active", "is_featured", "is_active"),
        CheckConstraint("rating_avg BETWEEN 0 AND 5", name="rating_avg_range"),
        CheckConstraint("rating_count >= 0", name="rating_count_non_negative"),
    )

    id: Mapped[BigIntPk]
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    brand_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("brands.id"), index=True)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("categories.id"))
    # Products are archived (is_active = false), never deleted once an order references them.
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    is_featured: Mapped[bool] = mapped_column(default=False, server_default="0")
    # Denormalized when a review is approved.
    rating_avg: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), default=Decimal("0.00"), server_default="0.00"
    )
    rating_count: Mapped[int] = mapped_column(default=0, server_default="0")

    brand: Mapped["Brand | None"] = relationship(lazy="raise")
    category: Mapped["Category"] = relationship(lazy="raise")
    translations: Mapped[list["ProductTranslation"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="raise"
    )
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.position",
        lazy="raise",
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.position",
        lazy="raise",
    )


class ProductTranslation(TimestampMixin, Base):
    __tablename__ = "product_translations"
    __table_args__ = (
        Index("ix_product_translations_fulltext", "name", "short_description", mysql_prefix="FULLTEXT"),
        enum_check("locale", Locale),
    )

    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    locale: Mapped[Locale] = mapped_column(str_enum(Locale, length=5), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    short_description: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    specs: Mapped[dict[str, Any] | None] = mapped_column(JSON)  # technical key/value pairs

    product: Mapped["Product"] = relationship(back_populates="translations", lazy="raise")


class Attribute(TimestampMixin, Base):
    """Global attributes (voltage, size...), so they double as listing filters."""

    __tablename__ = "attributes"

    id: Mapped[BigIntPk]
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[I18nLabel] = mapped_column(JSON)
    is_filterable: Mapped[bool] = mapped_column(default=True, server_default=true())

    values: Mapped[list["AttributeValue"]] = relationship(
        back_populates="attribute", order_by="AttributeValue.position", lazy="raise"
    )


class AttributeValue(TimestampMixin, Base):
    __tablename__ = "attribute_values"
    __table_args__ = (UniqueConstraint("attribute_id", "slug"),)

    id: Mapped[BigIntPk]
    attribute_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("attributes.id"))
    slug: Mapped[str] = mapped_column(String(60))  # used in filters: attr[]=voltage:18v
    value: Mapped[I18nLabel] = mapped_column(JSON)
    position: Mapped[int] = mapped_column(default=0, server_default="0")

    attribute: Mapped["Attribute"] = relationship(back_populates="values", lazy="raise")


variant_attribute_values = Table(
    "variant_attribute_values",
    Base.metadata,
    Column(
        "variant_id",
        BigInteger,
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "attribute_value_id",
        BigInteger,
        ForeignKey("attribute_values.id"),
        primary_key=True,
        index=True,
    ),
)


class ProductVariant(TimestampMixin, Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("stock >= 0", name="stock_non_negative"),
        CheckConstraint("price_usd >= 0", name="price_usd_non_negative"),
        CheckConstraint(
            "compare_at_price_usd IS NULL OR compare_at_price_usd > price_usd",
            name="compare_at_above_price",
        ),
    )

    id: Mapped[BigIntPk]
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"), index=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    price_usd: Mapped[Decimal] = mapped_column(UsdAmount)
    compare_at_price_usd: Mapped[Decimal | None] = mapped_column(UsdAmount)  # strikethrough
    stock: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    position: Mapped[int] = mapped_column(default=0, server_default="0")
    # Optimistic locking: an UPDATE with a stale version raises StaleDataError.
    version: Mapped[int] = mapped_column(server_default="1")

    __mapper_args__ = {"version_id_col": version}

    product: Mapped["Product"] = relationship(back_populates="variants", lazy="raise")
    attribute_values: Mapped[list["AttributeValue"]] = relationship(
        secondary=variant_attribute_values, lazy="raise"
    )


class ProductImage(TimestampMixin, Base):
    __tablename__ = "product_images"

    id: Mapped[BigIntPk]
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    variant_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    path: Mapped[str] = mapped_column(String(255))  # relative to the "media" volume
    alt: Mapped[I18nLabel | None] = mapped_column(JSON)
    position: Mapped[int] = mapped_column(default=0, server_default="0")

    product: Mapped["Product"] = relationship(back_populates="images", lazy="raise")
