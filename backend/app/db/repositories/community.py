from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Favorite, Product, Review, ReviewStatus

_WITH_PRODUCT = (
    selectinload(Review.product).options(
        selectinload(Product.translations), selectinload(Product.images)
    ),
)


class ReviewRepository(SqlAlchemyRepository[Review]):
    model = Review

    async def approved_for(
        self, product_id: int, *, offset: int, limit: int
    ) -> tuple[Sequence[Review], int]:
        filters = {"product_id": product_id, "status": ReviewStatus.APPROVED}
        rows = await self.list(
            offset=offset,
            limit=limit,
            order_by=(Review.created_at.desc(), Review.id.desc()),
            options=(selectinload(Review.user),),
            **filters,
        )
        return rows, await self.count(**filters)

    async def own(self, user_id: int, *, offset: int, limit: int) -> tuple[Sequence[Review], int]:
        rows = await self.list(
            offset=offset,
            limit=limit,
            order_by=(Review.created_at.desc(), Review.id.desc()),
            options=_WITH_PRODUCT,
            user_id=user_id,
        )
        return rows, await self.count(user_id=user_id)

    async def with_product(self, review_id: int) -> Review:
        return await self.get_fresh(options=_WITH_PRODUCT, id=review_id)

    async def approved_ratings(self, product_id: int) -> Sequence[int]:
        statement = (
            select(Review.rating)
            .where(Review.product_id == product_id, Review.status == ReviewStatus.APPROVED)
            .with_for_update(read=True)
        )
        return (await self.session.scalars(statement)).all()


class FavoriteRepository(SqlAlchemyRepository[Favorite]):
    model = Favorite

    async def add_once(self, user_id: int, product_id: int) -> None:
        upsert = insert(Favorite).values(user_id=user_id, product_id=product_id)
        await self.session.execute(upsert.on_duplicate_key_update(user_id=upsert.inserted.user_id))

    async def remove(self, user_id: int, product_id: int) -> None:
        await self.session.execute(
            delete(Favorite).where(Favorite.user_id == user_id, Favorite.product_id == product_id)
        )
