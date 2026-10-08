import math
from collections import defaultdict
from collections.abc import Sequence
from decimal import Decimal

from app.cache.decorators import Cache, cached
from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.db.repositories.catalog import (
    AttributeRepository,
    BrandRepository,
    CategoryRepository,
    ProductRepository,
)
from app.db.repositories.product_filter import ProductFilter, ProductSort
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Currency, Locale, Product, ProductImage, ProductTranslation, ProductVariant
from app.schemas.catalog import (
    AttributeRead,
    AttributeValueRead,
    BrandRead,
    BrandRef,
    CategoryNode,
    CategoryRef,
    CategoryRow,
    ImageRead,
    ProductCard,
    ProductDetail,
    ProductSearchParams,
    StockStatus,
    VariantAttribute,
    VariantRead,
)
from app.schemas.common import Money, Page
from app.services.pricing import PriceConverter, PricingService

FEATURED_LIMIT = 8


def media_url(path: str | None) -> str | None:
    return f"/media/{path}" if path else None


class CatalogService:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        cache: Cache,
        settings: Settings,
        pricing: PricingService,
    ) -> None:
        self.uow = uow
        self.cache = cache
        self.settings = settings
        self.pricing = pricing

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def active_categories(self) -> list[CategoryRow]:
        async with self.uow:
            categories = await CategoryRepository(self.uow.session).list_active()
            return [
                CategoryRow(
                    id=c.id,
                    parent_id=c.parent_id,
                    slug=c.slug,
                    name=c.name,
                    description=c.description,
                    image_path=c.image_path,
                    position=c.position,
                )
                for c in categories
            ]

    async def category_tree(self, locale: Locale) -> list[CategoryNode]:
        rows = await self.active_categories()
        children: dict[int | None, list[CategoryRow]] = defaultdict(list)
        for row in rows:
            children[row.parent_id].append(row)

        def build(parent_id: int | None) -> list[CategoryNode]:
            return [
                CategoryNode(
                    slug=row.slug,
                    name=row.name[locale],
                    description=row.description[locale] if row.description else None,
                    image_url=media_url(row.image_path),
                    children=build(row.id),
                )
                for row in children[parent_id]
            ]

        return build(None)

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def brands(self) -> list[BrandRead]:
        async with self.uow:
            brands = await BrandRepository(self.uow.session).list_active()
            return [BrandRead(slug=b.slug, name=b.name, logo_url=media_url(b.logo_path)) for b in brands]

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def attributes(self, locale: Locale) -> list[AttributeRead]:
        async with self.uow:
            attributes = await AttributeRepository(self.uow.session).list_filterable()
            return [
                AttributeRead(
                    code=a.code,
                    name=a.name[locale],
                    values=[AttributeValueRead(slug=v.slug, label=v.value[locale]) for v in a.values],
                )
                for a in attributes
            ]

    async def search(self, params: ProductSearchParams) -> Page[ProductCard]:
        converter = await self.pricing.converter(params.currency)
        product_filter = ProductFilter(
            q=params.q,
            category_ids=await self._category_ids(params.category) if params.category else None,
            brand_slugs=tuple(sorted(set(params.brand))),
            attributes=_group_attributes(params.attr),
            min_price_usd=_optional_usd(converter, params.min_price, params.currency),
            max_price_usd=_optional_usd(converter, params.max_price, params.currency),
            in_stock=params.in_stock,
            sort=params.sort or (ProductSort.RELEVANCE if params.q else ProductSort.NEWEST),
        )
        page = await self._search_usd(product_filter, params.locale, params.page, params.size)
        return page.model_copy(
            update={"items": [_card_in(card, converter, params.currency) for card in page.items]}
        )

    async def featured(self, locale: Locale, currency: Currency) -> list[ProductCard]:
        converter = await self.pricing.converter(currency)
        page = await self._search_usd(
            ProductFilter(), locale, 1, FEATURED_LIMIT, featured_only=True
        )
        return [_card_in(card, converter, currency) for card in page.items]

    async def detail(self, slug: str, locale: Locale, currency: Currency) -> ProductDetail:
        converter = await self.pricing.converter(currency)
        detail = await self._detail_usd(slug, locale)
        card = _card_in(detail, converter, currency)
        return detail.model_copy(
            update={
                "price_from": card.price_from,
                "compare_at": card.compare_at,
                "variants": [
                    variant.model_copy(
                        update={
                            "price": converter.convert(variant.price, currency),
                            "compare_at": converter.convert(variant.compare_at, currency),
                        }
                    )
                    for variant in detail.variants
                ],
            }
        )

    async def _category_ids(self, slug: str) -> tuple[int, ...]:
        rows = await self.active_categories()
        root = next((row for row in rows if row.slug == slug), None)
        if root is None:
            raise NotFoundError("Category not found.")
        ids, pending = [], [root.id]
        while pending:
            current = pending.pop()
            ids.append(current)
            pending.extend(row.id for row in rows if row.parent_id == current)
        return tuple(sorted(ids))

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def _search_usd(
        self,
        product_filter: ProductFilter,
        locale: Locale,
        page: int,
        size: int,
        featured_only: bool = False,
    ) -> Page[ProductCard]:
        async with self.uow:
            repository = ProductRepository(self.uow.session)
            products, total = await repository.search(
                product_filter,
                locale=locale,
                offset=(page - 1) * size,
                limit=size,
                featured_only=featured_only,
            )
            items = [self._card(product, locale) for product in products]
        return Page[ProductCard](
            items=items, page=page, size=size, total=total, pages=math.ceil(total / size)
        )

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def _detail_usd(self, slug: str, locale: Locale) -> ProductDetail:
        rows = {row.id: row for row in await self.active_categories()}
        async with self.uow:
            product = await ProductRepository(self.uow.session).get_visible_by_slug(slug)
            variants = _active_variants(product) if product else []
            if product is None or not variants:
                raise NotFoundError("Product not found.")
            card = self._card(product, locale)
            translation = _translation(product, locale)
            return ProductDetail(
                **card.model_dump(),
                description=translation.description,
                specs=translation.specs or {},
                category_path=_category_path(rows, product.category_id, locale),
                images=[_image(image, locale, translation.name) for image in product.images],
                variants=[self._variant(variant, locale) for variant in variants],
            )

    def _card(self, product: Product, locale: Locale) -> ProductCard:
        translation = _translation(product, locale)
        variants = _active_variants(product)
        cheapest = min(variants, key=lambda v: (v.price_usd, v.position))
        images = product.images
        return ProductCard(
            slug=product.slug,
            name=translation.name,
            short_description=translation.short_description,
            brand=BrandRef(slug=product.brand.slug, name=product.brand.name) if product.brand else None,
            image=_image(images[0], locale, translation.name) if images else None,
            price_from=_usd(cheapest.price_usd),
            compare_at=_usd(cheapest.compare_at_price_usd),
            stock_status=self._stock_status(sum(v.stock for v in variants)),
            rating_avg=product.rating_avg,
            rating_count=product.rating_count,
        )

    def _variant(self, variant: ProductVariant, locale: Locale) -> VariantRead:
        return VariantRead(
            id=variant.id,
            sku=variant.sku,
            price=_usd(variant.price_usd),
            compare_at=_usd(variant.compare_at_price_usd),
            stock_status=self._stock_status(variant.stock),
            attributes=[
                VariantAttribute(
                    code=value.attribute.code,
                    name=value.attribute.name[locale],
                    value_slug=value.slug,
                    value=value.value[locale],
                )
                for value in sorted(variant.attribute_values, key=lambda v: v.attribute_id)
            ],
        )

    def _stock_status(self, stock: int) -> StockStatus:
        if stock <= 0:
            return StockStatus.OUT_OF_STOCK
        if stock < self.settings.low_stock_threshold:
            return StockStatus.LOW_STOCK
        return StockStatus.IN_STOCK


def _usd(amount: Decimal | None) -> Money | None:
    return None if amount is None else Money(amount=amount, currency=Currency.USD)


def _card_in[CardT: ProductCard](card: CardT, converter: PriceConverter, currency: Currency) -> CardT:
    return card.model_copy(
        update={
            "price_from": converter.convert(card.price_from, currency),
            "compare_at": converter.convert(card.compare_at, currency),
        }
    )


def _optional_usd(
    converter: PriceConverter, amount: Decimal | None, currency: Currency
) -> Decimal | None:
    return None if amount is None else converter.to_usd(amount, currency)


def _group_attributes(pairs: Sequence[str]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for pair in pairs:
        code, slug = pair.split(":", 1)
        grouped[code].add(slug)
    return tuple((code, tuple(sorted(slugs))) for code, slugs in sorted(grouped.items()))


def _active_variants(product: Product) -> list[ProductVariant]:
    return [variant for variant in product.variants if variant.is_active]


def _translation(product: Product, locale: Locale) -> ProductTranslation:
    return next(t for t in product.translations if t.locale == locale)


def _image(image: ProductImage, locale: Locale, fallback_alt: str) -> ImageRead:
    alt = (image.alt or {}).get(locale) or fallback_alt
    return ImageRead(url=media_url(image.path) or "", alt=alt)


def _category_path(rows: dict[int, CategoryRow], category_id: int, locale: Locale) -> list[CategoryRef]:
    path: list[CategoryRef] = []
    current = rows.get(category_id)
    while current is not None:
        path.append(CategoryRef(slug=current.slug, name=current.name[locale]))
        current = rows.get(current.parent_id) if current.parent_id else None
    return list(reversed(path))
