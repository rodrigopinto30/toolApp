from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, Field

from app.models import Locale, Review, ReviewStatus
from app.schemas.catalog import ImageRead
from app.schemas.common import RequestModel
from app.schemas.validators import text


def public_name(first_name: str, last_name: str) -> str:
    initial = last_name[:1].upper()
    return f"{first_name} {initial}." if initial else first_name


class ReviewCreate(RequestModel):
    rating: int = Field(ge=1, le=5)
    title: Annotated[str, text(120)]
    body: Annotated[str, text(2000)]


class ReviewPageParams(BaseModel):
    page: int = Field(1, ge=1, le=1000)
    size: int = Field(10, ge=1, le=50)


class AccountReviewParams(ReviewPageParams):
    locale: Locale = Locale.ES


class ReviewRead(BaseModel):
    id: int
    rating: int
    title: str
    body: str
    author: str
    created_at: datetime

    @classmethod
    def from_review(cls, review: Review) -> Self:
        return cls(
            id=review.id,
            rating=review.rating,
            title=review.title,
            body=review.body,
            author=public_name(review.user.first_name, review.user.last_name),
            created_at=review.created_at,
        )


class ReviewProduct(BaseModel):
    slug: str
    name: str
    image: ImageRead | None


class OwnReviewRead(BaseModel):
    id: int
    product: ReviewProduct
    rating: int
    title: str
    body: str
    status: ReviewStatus
    created_at: datetime
