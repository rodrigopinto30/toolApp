from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from app.models import Review, ReviewStatus
from app.schemas.admin.common import AdminPageParams
from app.schemas.common import ReadModel


class AdminReviewParams(AdminPageParams):
    status: ReviewStatus | None = None
    product_id: int | None = Field(None, gt=0)


class ReviewAuthor(ReadModel):
    id: int
    email: str
    first_name: str
    last_name: str


class ReviewedProduct(BaseModel):
    id: int
    slug: str
    name: dict[str, str]


class AdminReviewRead(ReadModel):
    id: int
    product: ReviewedProduct
    author: ReviewAuthor
    rating: int
    title: str
    body: str
    status: ReviewStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_review(cls, review: Review) -> Self:
        product = review.product
        return cls(
            id=review.id,
            product=ReviewedProduct(
                id=product.id,
                slug=product.slug,
                name={item.locale: item.name for item in product.translations},
            ),
            author=ReviewAuthor.model_validate(review.user),
            rating=review.rating,
            title=review.title,
            body=review.body,
            status=review.status,
            created_at=review.created_at,
            updated_at=review.updated_at,
        )
