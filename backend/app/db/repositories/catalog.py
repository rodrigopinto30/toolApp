from collections.abc import Sequence
from dataclasses import replace
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, Subquery, and_, func, or_, select, true
from sqlalchemy.orm import aliased, selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.db.repositories.product_filter import (
    AttributeSelection,
    ProductFilter,
    ProductQueryColumns,
    variant_attribute_conditions,
)
from app.models import (
    Attribute,
    AttributeValue,
    Brand,
    Category,
    Locale,
    Product,
    ProductTranslation,
    ProductVariant,
    variant_attribute_values,
)
from app.schemas.catalog import ProductFacetCounts


class CategoryRepository(SqlAlchemyRepository[Category]):
    model = Category

    async def list_active(self) -> Sequence[Category]:
        statement = (
            select(Category)
            .where(Category.is_active.is_(true()))
            .order_by(Category.position, Category.id)
        )
        return (await self.session.scalars(statement)).all()


class BrandRepository(SqlAlchemyRepository[Brand]):
    model = Brand

    async def list_active(self) -> Sequence[Brand]:
        statement = select(Brand).where(Brand.is_active.is_(true())).order_by(Brand.name)
        return (await self.session.scalars(statement)).all()


class AttributeRepository(SqlAlchemyRepository[Attribute]):
    model = Attribute

    async def list_filterable(self) -> Sequence[Attribute]:
        statement = (
            select(Attribute)
            .where(Attribute.is_filterable.is_(true()))
            .options(selectinload(Attribute.values))
            .order_by(Attribute.id)
        )
        return (await self.session.scalars(statement)).all()


_PRODUCT_OPTIONS = (
    selectinload(Product.translations),
    selectinload(Product.brand),
    selectinload(Product.images),
)


class ProductRepository(SqlAlchemyRepository[Product]):
    model = Product

    async def search(
        self,
        product_filter: ProductFilter,
        *,
        locale: Locale,
        offset: int,
        limit: int,
        featured_only: bool = False,
    ) -> tuple[Sequence[Product], int]:
        statement, _ = self._listing(product_filter, locale, featured_only=featured_only)

        total = await self.session.scalar(
            select(func.count()).select_from(statement.order_by(None).subquery())
        )
        page = await self.session.scalars(
            statement.options(*_PRODUCT_OPTIONS, selectinload(Product.variants))
            .offset(offset)
            .limit(limit)
        )
        return page.all(), total or 0

    async def facet_counts(
        self, product_filter: ProductFilter, *, locale: Locale
    ) -> ProductFacetCounts:
        price_min, price_max = await self._price_range(
            replace(product_filter, min_price_usd=None, max_price_usd=None), locale
        )
        return ProductFacetCounts(
            brands=await self._brand_counts(replace(product_filter, brand_slugs=()), locale),
            attribute_values=await self._attribute_value_counts(product_filter, locale),
            price_min_usd=price_min,
            price_max_usd=price_max,
        )

    async def _price_range(
        self, product_filter: ProductFilter, locale: Locale
    ) -> tuple[Decimal | None, Decimal | None]:
        matching = self._matching(product_filter, locale)
        statement = select(func.min(matching.c.price_from), func.max(matching.c.price_from))
        price_min, price_max = (await self.session.execute(statement)).one()
        return price_min, price_max

    async def _brand_counts(self, product_filter: ProductFilter, locale: Locale) -> dict[str, int]:
        matching = self._matching(product_filter, locale)
        statement = (
            select(Brand.slug, func.count())
            .select_from(matching)
            .join(Product, Product.id == matching.c.id)
            .join(Brand, Brand.id == Product.brand_id)
            .group_by(Brand.slug)
        )
        return {slug: count for slug, count in await self.session.execute(statement)}

    async def _attribute_value_counts(
        self, product_filter: ProductFilter, locale: Locale
    ) -> dict[str, dict[str, int]]:
        selected = [code for code, _ in product_filter.attributes]
        matching = self._matching(replace(product_filter, attributes=()), locale)
        groups: list[tuple[str | None, AttributeSelection]] = [(None, product_filter.attributes)]
        for code in selected:
            others = tuple(item for item in product_filter.attributes if item[0] != code)
            groups.append((code, others))
        counts: dict[str, dict[str, int]] = {}
        for code, required in groups:
            variant = aliased(ProductVariant)
            statement = (
                select(Attribute.code, AttributeValue.slug, func.count(variant.product_id.distinct()))
                .select_from(variant)
                .join(matching, matching.c.id == variant.product_id)
                .join(variant_attribute_values, variant_attribute_values.c.variant_id == variant.id)
                .join(AttributeValue, AttributeValue.id == variant_attribute_values.c.attribute_value_id)
                .join(Attribute, Attribute.id == AttributeValue.attribute_id)
                .where(
                    variant.is_active.is_(true()),
                    Attribute.is_filterable.is_(true()),
                    Attribute.code == code if code else Attribute.code.not_in(selected),
                    *variant_attribute_conditions(variant, required),
                )
                .group_by(Attribute.code, AttributeValue.slug)
            )
            for attribute_code, slug, count in await self.session.execute(statement):
                counts.setdefault(attribute_code, {})[slug] = count
        return counts

    def _matching(self, product_filter: ProductFilter, locale: Locale) -> Subquery:
        statement, columns = self._listing(product_filter, locale)
        return (
            statement.with_only_columns(Product.id, columns.price_from, maintain_column_froms=True)
            .order_by(None)
            .subquery()
        )

    def _listing(
        self, product_filter: ProductFilter, locale: Locale, *, featured_only: bool = False
    ) -> tuple[Select[Any], ProductQueryColumns]:
        prices = (
            select(
                ProductVariant.product_id,
                func.min(ProductVariant.price_usd).label("price_from"),
                func.max(ProductVariant.stock).label("max_stock"),
            )
            .where(ProductVariant.is_active.is_(true()))
            .group_by(ProductVariant.product_id)
            .subquery()
        )
        translation = aliased(ProductTranslation)
        statement = (
            select(Product)
            .join(prices, prices.c.product_id == Product.id)
            .join(
                translation,
                and_(translation.product_id == Product.id, translation.locale == locale),
            )
            .join(Category, Category.id == Product.category_id)
            .outerjoin(Brand, Brand.id == Product.brand_id)
            .where(
                Product.is_active.is_(true()),
                Category.is_active.is_(true()),
                or_(Product.brand_id.is_(None), Brand.is_active.is_(true())),
            )
        )
        if featured_only:
            statement = statement.where(Product.is_featured.is_(true()))
        columns = ProductQueryColumns(translation, prices.c.price_from, prices.c.max_stock)
        return product_filter.apply(statement, columns), columns

    async def get_visible_by_slug(self, slug: str) -> Product | None:
        statement = (
            select(Product)
            .join(Category, Category.id == Product.category_id)
            .outerjoin(Brand, Brand.id == Product.brand_id)
            .where(
                Product.slug == slug,
                Product.is_active.is_(true()),
                Category.is_active.is_(true()),
                or_(Product.brand_id.is_(None), Brand.is_active.is_(true())),
            )
            .options(
                *_PRODUCT_OPTIONS,
                selectinload(Product.variants)
                .selectinload(ProductVariant.attribute_values)
                .selectinload(AttributeValue.attribute),
            )
        )
        return await self.session.scalar(statement)

    async def variants_with_details(
        self, variant_ids: Sequence[int], *, lock: bool = False
    ) -> Sequence[ProductVariant]:
        if not variant_ids:
            return []
        statement = (
            select(ProductVariant)
            .where(ProductVariant.id.in_(variant_ids))
            .options(
                selectinload(ProductVariant.product).options(
                    *_PRODUCT_OPTIONS, selectinload(Product.category)
                ),
                selectinload(ProductVariant.attribute_values).selectinload(AttributeValue.attribute),
            )
        )
        if lock:
            statement = (
                statement.order_by(ProductVariant.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        return (await self.session.scalars(statement)).all()

    async def active_variants(self, variant_ids: Sequence[int]) -> Sequence[ProductVariant]:
        statement = (
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.is_active.is_(true()),
                Product.is_active.is_(true()),
            )
        )
        return (await self.session.scalars(statement)).all()
