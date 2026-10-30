from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.v1.deps import CurrentUser, VerifiedUser, user_rate_limit
from app.api.v1.params import LocaleQuery, public_cache
from app.core.container import ReviewServiceDep
from app.models import Locale
from app.schemas.catalog import Slug
from app.schemas.common import Page
from app.schemas.reviews import (
    AccountReviewParams,
    OwnReviewRead,
    ReviewCreate,
    ReviewPageParams,
    ReviewProduct,
    ReviewRead,
)

router = APIRouter(tags=["reviews"])


@router.get("/products/{slug}/reviews", dependencies=[Depends(public_cache)])
async def list_product_reviews(
    slug: Slug, params: Annotated[ReviewPageParams, Query()], reviews: ReviewServiceDep
) -> Page[ReviewRead]:
    return await reviews.for_product(slug, params.page, params.size)


@router.post(
    "/products/{slug}/reviews",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(user_rate_limit("review", limit=10, window=3600))],
)
async def create_review(
    slug: Slug,
    body: ReviewCreate,
    user: VerifiedUser,
    reviews: ReviewServiceDep,
    locale: LocaleQuery = Locale.ES,
) -> OwnReviewRead:
    return await reviews.create(user, slug, body, locale)


@router.get("/me/reviews")
async def list_own_reviews(
    user: CurrentUser, params: Annotated[AccountReviewParams, Query()], reviews: ReviewServiceDep
) -> Page[OwnReviewRead]:
    return await reviews.own(user.id, params)


@router.get("/me/reviewable")
async def list_reviewable_products(
    user: CurrentUser, params: Annotated[AccountReviewParams, Query()], reviews: ReviewServiceDep
) -> Page[ReviewProduct]:
    return await reviews.reviewable(user.id, params)
