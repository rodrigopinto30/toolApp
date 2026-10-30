from collections.abc import Sequence
from dataclasses import replace
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, Subquery, and_, exists, func, or_, select, true, update
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.sql import ColumnElement

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
    Favorite,
    Locale,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductImage,
    ProductTranslation,
    ProductVariant,
    Review,
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

    async def parents(self) -> dict[int, int | None]:
        rows = await self.session.execute(select(Category.id, Category.parent_id))
        return {category_id: parent_id for category_id, parent_id in rows}

    async def lock_tree(self) -> None:
        await self.session.execute(select(Category.id).with_for_update())


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

    async def values_by_ids(self, ids: Sequence[int]) -> Sequence[AttributeValue]:
        if not ids:
            return []
        statement = select(AttributeValue).where(AttributeValue.id.in_(ids))
        return (await self.session.scalars(statement)).all()


_PRODUCT_OPTIONS = (
    selectinload(Product.translations),
    selectinload(Product.brand),
    selectinload(Product.images),
)


def _visible(statement: Select[Any]) -> Select[Any]:
    return (
        statement.join(Category, Category.id == Product.category_id)
        .outerjoin(Brand, Brand.id == Product.brand_id)
        .where(
            Product.is_active.is_(true()),
            Category.is_active.is_(true()),
            or_(Product.brand_id.is_(None), Brand.is_active.is_(true())),
        )
    )


def _has_active_variant() -> ColumnElement[bool]:
    return Product.variants.any(ProductVariant.is_active.is_(true()))


def _delivered_to(user_id: int) -> Select[tuple[int]]:
    return (
        select(ProductVariant.product_id)
        .join(OrderItem, OrderItem.variant_id == ProductVariant.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.user_id == user_id, Order.status == OrderStatus.DELIVERED)
    )


class ProductRepository(SqlAlchemyRepository[Product]):
    model = Product

    async def next_image_position(self, product_id: int) -> int:
        statement = select(func.coalesce(func.max(ProductImage.position) + 1, 0)).where(
            ProductImage.product_id == product_id
        )
        return await self.session.scalar(statement) or 0

    async def admin_search(
        self,
        *,
        q: str | None,
        category_id: int | None,
        brand_id: int | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Product], int]:
        exact = (
            (Product.category_id, category_id),
            (Product.brand_id, brand_id),
            (Product.is_active, is_active),
        )
        conditions = [column == value for column, value in exact if value is not None]
        if q is not None:
            conditions.append(
                or_(
                    Product.slug.contains(q, autoescape=True),
                    Product.translations.any(ProductTranslation.name.contains(q, autoescape=True)),
                    Product.variants.any(ProductVariant.sku.contains(q, autoescape=True)),
                )
            )
        total = await self.session.scalar(
            select(func.count()).select_from(Product).where(*conditions)
        )
        statement = (
            select(Product)
            .where(*conditions)
            .options(selectinload(Product.translations), selectinload(Product.variants))
            .order_by(Product.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(statement)).all(), total or 0

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
        return await self._page(statement, offset, limit)

    async def favorites(
        self, user_id: int, *, locale: Locale, offset: int, limit: int
    ) -> tuple[Sequence[Product], int]:
        statement, _ = self._listing(ProductFilter(), locale)
        statement = (
            statement.join(Favorite, Favorite.product_id == Product.id)
            .where(Favorite.user_id == user_id)
            .order_by(None)
            .order_by(Favorite.created_at.desc(), Product.id.desc())
        )
        return await self._page(statement, offset, limit)

    async def favorite_slugs(self, user_id: int) -> Sequence[str]:
        statement = (
            _visible(select(Product.slug))
            .join(Favorite, Favorite.product_id == Product.id)
            .where(Favorite.user_id == user_id, _has_active_variant())
            .order_by(Favorite.created_at.desc(), Product.id.desc())
        )
        return (await self.session.scalars(statement)).all()

    async def reviewable(
        self, user_id: int, *, locale: Locale, offset: int, limit: int
    ) -> tuple[Sequence[Product], int]:
        reviewed = select(Review.product_id).where(Review.user_id == user_id)
        statement, _ = self._listing(ProductFilter(), locale)
        statement = statement.where(
            Product.id.in_(_delivered_to(user_id)), Product.id.not_in(reviewed)
        )
        return await self._page(statement, offset, limit)

    async def set_rating(self, product_id: int, average: Decimal, count: int) -> None:
        await self.session.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(rating_avg=average, rating_count=count)
        )

    async def was_delivered_to(self, user_id: int, product_id: int) -> bool:
        delivered = _delivered_to(user_id).where(ProductVariant.product_id == product_id)
        return bool(await self.session.scalar(select(exists(delivered))))

    async def _page(
        self, statement: Select[Any], offset: int, limit: int
    ) -> tuple[Sequence[Product], int]:
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
        statement = _visible(
            select(Product)
            .join(prices, prices.c.product_id == Product.id)
            .join(
                translation,
                and_(translation.product_id == Product.id, translation.locale == locale),
            )
        )
        if featured_only:
            statement = statement.where(Product.is_featured.is_(true()))
        columns = ProductQueryColumns(translation, prices.c.price_from, prices.c.max_stock)
        return product_filter.apply(statement, columns), columns

    async def visible_id(self, slug: str) -> int | None:
        statement = _visible(select(Product.id)).where(Product.slug == slug, _has_active_variant())
        return await self.session.scalar(statement)

    async def get_visible_by_slug(self, slug: str) -> Product | None:
        statement = (
            _visible(select(Product))
            .where(Product.slug == slug)
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
