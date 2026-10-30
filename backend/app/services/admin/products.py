from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, BusinessRuleViolation, ConflictError, NotFoundError
from app.db.repositories.catalog import AttributeRepository, ProductRepository
from app.db.types import utcnow
from app.models import (
    AttributeValue,
    Brand,
    Category,
    Locale,
    Product,
    ProductTranslation,
    ProductVariant,
)
from app.schemas.admin.products import (
    AdminProductRead,
    AdminProductSummary,
    AdminVariantRead,
    ProductListParams,
    StockAdjustment,
)
from app.schemas.common import Page
from app.services.admin.base import AdminResource, taken
from app.services.audit import diff, snapshot
from app.services.catalog import product_translation

TEXT_FIELDS = ("name", "short_description", "description", "specs")


class ProductAdmin(AdminResource[Product, AdminProductRead]):
    model = Product
    read = AdminProductRead
    entity = "product"
    fields = ("slug", "brand_id", "category_id", "is_active", "is_featured")
    ordering = (Product.id.desc(),)
    namespaces = ("catalog",)
    load = (
        selectinload(Product.translations),
        selectinload(Product.images),
        selectinload(Product.variants).selectinload(ProductVariant.attribute_values),
    )

    def conflict(self) -> AppError:
        return taken("slug")

    async def search(self, params: ProductListParams) -> Page[AdminProductSummary]:
        async with self.uow:
            products, total = await ProductRepository(self.uow.session).admin_search(
                q=params.q,
                category_id=params.category_id,
                brand_id=params.brand_id,
                is_active=params.is_active,
                offset=params.offset,
                limit=params.size,
            )
            items = [_summary(product, params.locale) for product in products]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def validate(self, state: Mapping[str, Any], entity: Product | None) -> None:
        category_id, brand_id = state["category_id"], state["brand_id"]
        if entity is None or category_id != entity.category_id:
            if not await self.uow.repository(Category).exists(id=category_id, is_active=True):
                raise BusinessRuleViolation(
                    "The category does not exist or is not active.", code="unknown_category"
                )
        if brand_id is not None and (entity is None or brand_id != entity.brand_id):
            if not await self.uow.repository(Brand).exists(id=brand_id, is_active=True):
                raise BusinessRuleViolation(
                    "The brand does not exist or is not active.", code="unknown_brand"
                )

    def _present(self, entity: Product) -> AdminProductRead:
        return AdminProductRead.from_product(entity)

    def _state(self, entity: Product) -> dict[str, Any]:
        texts = {
            f"{translation.locale}.{field}": getattr(translation, field)
            for translation in entity.translations
            for field in TEXT_FIELDS
        }
        return {**super()._state(entity), **texts}

    async def _build(self, values: dict[str, Any]) -> Product:
        columns = {field: value for field, value in values.items() if field != "translations"}
        translations = [
            ProductTranslation(locale=Locale(locale), **texts)
            for locale, texts in values["translations"].items()
        ]
        return Product(**columns, translations=translations)

    async def _apply(self, entity: Product, values: Mapping[str, Any]) -> None:
        columns = {field: value for field, value in values.items() if field != "translations"}
        await super()._apply(entity, columns)
        if "translations" in values:
            for translation in entity.translations:
                for field, value in values["translations"][translation.locale].items():
                    setattr(translation, field, value)


def _summary(product: Product, locale: Locale) -> AdminProductSummary:
    active = [variant for variant in product.variants if variant.is_active]
    return AdminProductSummary(
        id=product.id,
        slug=product.slug,
        name=product_translation(product, locale).name,
        brand_id=product.brand_id,
        category_id=product.category_id,
        is_active=product.is_active,
        is_featured=product.is_featured,
        variant_count=len(product.variants),
        stock=sum(variant.stock for variant in active),
        price_from_usd=min((variant.price_usd for variant in active), default=None),
    )


class VariantAdmin(AdminResource[ProductVariant, AdminVariantRead]):
    model = ProductVariant
    read = AdminVariantRead
    entity = "product_variant"
    fields = ("sku", "price_usd", "compare_at_price_usd", "position", "is_active")
    ordering = (ProductVariant.id,)
    namespaces = ("catalog",)
    load = (selectinload(ProductVariant.attribute_values),)

    def conflict(self) -> AppError:
        return taken("sku")

    async def validate(self, state: Mapping[str, Any], entity: ProductVariant | None) -> None:
        if entity is None:
            if not await self.uow.repository(Product).exists(id=state["product_id"]):
                raise NotFoundError()
        elif state.get("version", entity.version) != entity.version:
            raise ConflictError(
                "The variant changed since it was read.",
                code="version_conflict",
                details=self._present(entity).model_dump(mode="json"),
            )
        compare_at = state["compare_at_price_usd"]
        if compare_at is not None and compare_at <= state["price_usd"]:
            raise BusinessRuleViolation(
                "The previous price must be above the price.", code="invalid_compare_at"
            )

    async def adjust_stock(self, variant_id: int, body: StockAdjustment) -> AdminVariantRead:
        async with self.uow:
            variant = await self._load(variant_id)
            stock = variant.stock + body.delta
            if stock < 0:
                raise ConflictError(
                    "Not enough stock for that adjustment.",
                    code="insufficient_stock",
                    details={"stock": variant.stock},
                )
            changes = diff({"stock": variant.stock}, {"stock": stock, "reason": body.reason})
            variant.stock = stock
            saved = await self._save(variant)
            self.audit.record(self.uow.session, "stock_adjust", self.entity, variant_id, changes)
            result = self._present(saved)
        await self.changes.publish(*self.namespaces)
        return result

    def _present(self, entity: ProductVariant) -> AdminVariantRead:
        return AdminVariantRead.from_variant(entity)

    def _state(self, entity: ProductVariant) -> dict[str, Any]:
        ids = sorted(value.id for value in entity.attribute_values)
        return {**snapshot(entity, self.fields), "attribute_value_ids": ids}

    async def _build(self, values: dict[str, Any]) -> ProductVariant:
        columns = {k: v for k, v in values.items() if k != "attribute_value_ids"}
        chosen = await self._attribute_values(values["attribute_value_ids"])
        return ProductVariant(**columns, attribute_values=chosen)

    async def _apply(self, entity: ProductVariant, values: Mapping[str, Any]) -> None:
        skipped = ("version", "attribute_value_ids")
        await super()._apply(entity, {k: v for k, v in values.items() if k not in skipped})
        if "attribute_value_ids" in values:
            chosen = await self._attribute_values(values["attribute_value_ids"])
            if {value.id for value in chosen} != {value.id for value in entity.attribute_values}:
                entity.attribute_values = chosen
                entity.updated_at = utcnow()

    async def _attribute_values(self, ids: Sequence[int]) -> list[AttributeValue]:
        values = await AttributeRepository(self.uow.session).values_by_ids(ids)
        if len(values) != len(set(ids)):
            raise BusinessRuleViolation(
                "Some attribute values do not exist.", code="unknown_attribute_value"
            )
        if len({value.attribute_id for value in values}) != len(values):
            raise BusinessRuleViolation(
                "A variant has one value per attribute.", code="duplicate_attribute"
            )
        return list(values)
