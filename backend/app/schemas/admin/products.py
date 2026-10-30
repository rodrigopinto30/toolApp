from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, ClassVar, Self

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

from app.media.paths import media_url
from app.models import Locale, Product, ProductTranslation, ProductVariant
from app.schemas.admin.common import (
    AdminPageParams,
    I18nText,
    Position,
    PositiveUsdAmount,
    UsdAmount,
    slug,
)
from app.schemas.common import PatchModel, ReadModel, RequestModel
from app.schemas.validators import text

MAX_STOCK_CHANGE = 1_000_000
MAX_VARIANT_ATTRIBUTES = 20

ProductSlug = Annotated[str, slug(160)]
Sku = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$"
    ),
]
Specs = Annotated[
    dict[Annotated[str, text(80)], Annotated[str, text(255)]], Field(max_length=50)
]
AttributeValueIds = Annotated[list[Annotated[int, Field(gt=0)]], Field(max_length=MAX_VARIANT_ATTRIBUTES)]


class ProductText(RequestModel):
    name: Annotated[str, text(200)]
    short_description: Annotated[str, text(500)]
    description: Annotated[str, text(10_000)]
    specs: Specs | None = None


class ProductTexts(RequestModel):
    es: ProductText
    en: ProductText


class ProductCreate(RequestModel):
    slug: ProductSlug
    category_id: int = Field(gt=0)
    brand_id: int | None = Field(None, gt=0)
    is_featured: bool = False
    translations: ProductTexts


class ProductUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"brand_id"})

    slug: ProductSlug | None = None
    category_id: int | None = Field(None, gt=0)
    brand_id: int | None = Field(None, gt=0)
    is_featured: bool | None = None
    is_active: bool | None = None
    translations: ProductTexts | None = None


class ProductListParams(AdminPageParams):
    q: str | None = Field(None, min_length=2, max_length=100)
    category_id: int | None = Field(None, gt=0)
    brand_id: int | None = Field(None, gt=0)
    is_active: bool | None = None
    locale: Locale = Locale.ES


class VariantCreate(RequestModel):
    sku: Sku
    price_usd: UsdAmount
    compare_at_price_usd: PositiveUsdAmount | None = None
    stock: int = Field(0, ge=0, le=MAX_STOCK_CHANGE)
    position: Position = 0
    is_active: bool = True
    attribute_value_ids: AttributeValueIds = []


class VariantUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"compare_at_price_usd"})

    version: int = Field(gt=0)
    sku: Sku | None = None
    price_usd: UsdAmount | None = None
    compare_at_price_usd: PositiveUsdAmount | None = None
    position: Position | None = None
    is_active: bool | None = None
    attribute_value_ids: AttributeValueIds | None = None


class StockAdjustment(RequestModel):
    delta: int = Field(ge=-MAX_STOCK_CHANGE, le=MAX_STOCK_CHANGE)
    reason: Annotated[str, text(255)]

    @field_validator("delta")
    @classmethod
    def check_delta(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta cannot be 0")
        return value


class ImageUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"alt", "variant_id"})

    alt: I18nText | None = None
    position: Position | None = None
    variant_id: int | None = Field(None, gt=0)


class AdminImageRead(ReadModel):
    id: int
    product_id: int
    variant_id: int | None
    url: Annotated[str, AfterValidator(media_url)] = Field(validation_alias="path")
    alt: I18nText | None
    position: int
    width: int | None
    height: int | None


class AdminVariantRead(BaseModel):
    id: int
    product_id: int
    sku: str
    price_usd: Decimal
    compare_at_price_usd: Decimal | None
    stock: int
    position: int
    is_active: bool
    version: int
    attribute_value_ids: list[int]
    updated_at: datetime

    @classmethod
    def from_variant(cls, variant: ProductVariant) -> Self:
        return cls(
            id=variant.id,
            product_id=variant.product_id,
            sku=variant.sku,
            price_usd=variant.price_usd,
            compare_at_price_usd=variant.compare_at_price_usd,
            stock=variant.stock,
            position=variant.position,
            is_active=variant.is_active,
            version=variant.version,
            attribute_value_ids=sorted(value.id for value in variant.attribute_values),
            updated_at=variant.updated_at,
        )


class AdminProductText(BaseModel):
    name: str
    short_description: str
    description: str
    specs: dict[str, Any] | None

    @classmethod
    def from_translation(cls, translation: ProductTranslation) -> Self:
        return cls(
            name=translation.name,
            short_description=translation.short_description,
            description=translation.description,
            specs=translation.specs,
        )


class AdminProductTexts(BaseModel):
    es: AdminProductText
    en: AdminProductText


class AdminProductRead(BaseModel):
    id: int
    slug: str
    brand_id: int | None
    category_id: int
    is_active: bool
    is_featured: bool
    rating_avg: Decimal
    rating_count: int
    translations: AdminProductTexts
    variants: list[AdminVariantRead]
    images: list[AdminImageRead]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_product(cls, product: Product) -> Self:
        texts = {t.locale: AdminProductText.from_translation(t) for t in product.translations}
        return cls(
            id=product.id,
            slug=product.slug,
            brand_id=product.brand_id,
            category_id=product.category_id,
            is_active=product.is_active,
            is_featured=product.is_featured,
            rating_avg=product.rating_avg,
            rating_count=product.rating_count,
            translations=AdminProductTexts(es=texts[Locale.ES], en=texts[Locale.EN]),
            variants=[AdminVariantRead.from_variant(variant) for variant in product.variants],
            images=[AdminImageRead.model_validate(image) for image in product.images],
            created_at=product.created_at,
            updated_at=product.updated_at,
        )


class AdminProductSummary(BaseModel):
    id: int
    slug: str
    name: str
    brand_id: int | None
    category_id: int
    is_active: bool
    is_featured: bool
    variant_count: int
    stock: int
    price_from_usd: Decimal | None
