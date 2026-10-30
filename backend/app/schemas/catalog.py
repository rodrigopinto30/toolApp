from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.db.repositories.product_filter import ProductSort
from app.models import Currency, Locale
from app.schemas.common import Money

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=160)]
AttributeFilter = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]+:[a-z0-9-]+$", max_length=100)]


class StockStatus(StrEnum):
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"


class CategoryRow(BaseModel):
    id: int
    parent_id: int | None
    slug: str
    name: dict[str, str]
    description: dict[str, str] | None
    image_path: str | None
    position: int


class CategoryNode(BaseModel):
    slug: str
    name: str
    description: str | None
    image_url: str | None
    children: list["CategoryNode"] = []


class CategoryRef(BaseModel):
    slug: str
    name: str


class BrandRead(BaseModel):
    slug: str
    name: str
    logo_url: str | None


class BrandRef(BaseModel):
    slug: str
    name: str


class AttributeValueRead(BaseModel):
    slug: str
    label: str


class AttributeRead(BaseModel):
    code: str
    name: str
    values: list[AttributeValueRead]


class ImageRead(BaseModel):
    url: str
    alt: str
    width: int | None = None
    height: int | None = None


class VariantAttribute(BaseModel):
    code: str
    name: str
    value_slug: str
    value: str


class VariantRead(BaseModel):
    id: int
    sku: str
    price: Money
    compare_at: Money | None
    stock_status: StockStatus
    attributes: list[VariantAttribute]


class ProductCard(BaseModel):
    slug: str
    name: str
    short_description: str
    brand: BrandRef | None
    image: ImageRead | None
    price_from: Money
    price_varies: bool
    compare_at: Money | None
    stock_status: StockStatus
    rating_avg: Decimal
    rating_count: int


class ProductDetail(ProductCard):
    description: str
    specs: dict[str, Any]
    category_path: list[CategoryRef]
    images: list[ImageRead]
    variants: list[VariantRead]


class ProductFilterParams(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    q: str | None = Field(None, min_length=2, max_length=100)
    category: Slug | None = None
    brand: list[Slug] = Field(default_factory=list, max_length=20)
    attr: list[AttributeFilter] = Field(default_factory=list, alias="attr[]", max_length=20)
    min_price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    max_price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    in_stock: bool = False
    currency: Currency = Currency.ARS
    locale: Locale = Locale.ES

    @model_validator(mode="after")
    def check_price_range(self) -> Self:
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("min_price must be less than or equal to max_price")
        return self


class ProductSearchParams(ProductFilterParams):
    sort: ProductSort | None = None
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(24, ge=1, le=48)


class FacetValue(BaseModel):
    slug: str
    label: str
    count: int


class AttributeFacet(BaseModel):
    code: str
    name: str
    values: list[FacetValue]


class PriceRange(BaseModel):
    min: Money
    max: Money


class ProductFacets(BaseModel):
    brands: list[FacetValue]
    attributes: list[AttributeFacet]
    price: PriceRange | None


class ProductFacetCounts(BaseModel):
    brands: dict[str, int]
    attribute_values: dict[str, dict[str, int]]
    price_min_usd: Decimal | None
    price_max_usd: Decimal | None
