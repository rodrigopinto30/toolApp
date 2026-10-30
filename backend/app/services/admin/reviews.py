from collections.abc import Mapping
from typing import Any

from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.community import ReviewRepository
from app.models import Product, Review, ReviewStatus
from app.schemas.admin.reviews import AdminReviewParams, AdminReviewRead
from app.schemas.common import Page
from app.services.admin.base import AdminResource
from app.services.reviews import rating_summary


class ReviewAdmin(AdminResource[Review, AdminReviewRead]):
    model = Review
    read = AdminReviewRead
    entity = "review"
    fields = ("status",)
    ordering = (Review.created_at.desc(), Review.id.desc())
    namespaces = ("catalog",)
    load = (
        selectinload(Review.user),
        selectinload(Review.product).selectinload(Product.translations),
    )

    async def search(self, params: AdminReviewParams) -> Page[AdminReviewRead]:
        exact = {"status": params.status, "product_id": params.product_id}
        self.scope = {field: value for field, value in exact.items() if value is not None}
        return await self.page(params)

    async def approve(self, review_id: int) -> AdminReviewRead:
        return await self._change(review_id, {"status": ReviewStatus.APPROVED}, "approve")

    async def reject(self, review_id: int) -> AdminReviewRead:
        return await self._change(review_id, {"status": ReviewStatus.REJECTED}, "reject")

    def _present(self, entity: Review) -> AdminReviewRead:
        return AdminReviewRead.from_review(entity)

    async def _load(self, key: int | str) -> Review:
        review = await self.uow.repository(Review).get(key)
        if review is None:
            raise NotFoundError()
        await self.uow.repository(Product).get_locked(id=review.product_id)
        return await super()._load(key)

    async def _apply(self, entity: Review, values: Mapping[str, Any]) -> None:
        await super()._apply(entity, values)
        await self.uow.flush()
        session = self.uow.session
        ratings = await ReviewRepository(session).approved_ratings(entity.product_id)
        await ProductRepository(session).set_rating(entity.product_id, *rating_summary(ratings))
