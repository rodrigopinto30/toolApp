from app.core.exceptions import NotFoundError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.community import FavoriteRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.schemas.catalog import ProductCard
from app.schemas.common import Page
from app.schemas.favorites import FavoriteParams
from app.services.catalog import CatalogService, card_in
from app.services.pricing import PricingService


class FavoriteService:
    def __init__(
        self, uow: SqlAlchemyUnitOfWork, catalog: CatalogService, pricing: PricingService
    ) -> None:
        self.uow = uow
        self.catalog = catalog
        self.pricing = pricing

    async def page(self, user_id: int, params: FavoriteParams) -> Page[ProductCard]:
        converter = await self.pricing.converter(params.currency)
        async with self.uow:
            products, total = await ProductRepository(self.uow.session).favorites(
                user_id,
                locale=params.locale,
                offset=(params.page - 1) * params.size,
                limit=params.size,
            )
            items = [
                card_in(self.catalog.card(product, params.locale), converter, params.currency)
                for product in products
            ]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def slugs(self, user_id: int) -> list[str]:
        async with self.uow:
            return list(await ProductRepository(self.uow.session).favorite_slugs(user_id))

    async def add(self, user_id: int, slug: str) -> None:
        async with self.uow:
            product_id = await ProductRepository(self.uow.session).visible_id(slug)
            if product_id is None:
                raise NotFoundError("Product not found.")
            await FavoriteRepository(self.uow.session).add_once(user_id, product_id)

    async def remove(self, user_id: int, slug: str) -> None:
        async with self.uow:
            product = await ProductRepository(self.uow.session).get_by(slug=slug)
            if product is None:
                raise NotFoundError("Product not found.")
            await FavoriteRepository(self.uow.session).remove(user_id, product.id)
