from collections.abc import Sequence

from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.orm import aliased, selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.models import (
    Attribute,
    AttributeValue,
    Brand,
    Category,
    Locale,
    Product,
    ProductTranslation,
    ProductVariant,
)
from app.db.repositories.product_filter import ProductFilter, ProductQueryColumns


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
        statement = product_filter.apply(
            statement,
            ProductQueryColumns(translation, prices.c.price_from, prices.c.max_stock),
        )

        total = await self.session.scalar(
            select(func.count()).select_from(statement.order_by(None).subquery())
        )
        page = await self.session.scalars(
            statement.options(*_PRODUCT_OPTIONS, selectinload(Product.variants))
            .offset(offset)
            .limit(limit)
        )
        return page.all(), total or 0

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
