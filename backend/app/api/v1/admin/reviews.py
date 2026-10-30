from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1.admin.deps import EntityId, ReviewAdminDep
from app.schemas.admin.reviews import AdminReviewParams, AdminReviewRead
from app.schemas.common import Page

router = APIRouter(prefix="/reviews")


@router.get("")
async def list_reviews(
    params: Annotated[AdminReviewParams, Query()], reviews: ReviewAdminDep
) -> Page[AdminReviewRead]:
    return await reviews.search(params)


@router.post("/{review_id}/approve")
async def approve_review(review_id: EntityId, reviews: ReviewAdminDep) -> AdminReviewRead:
    return await reviews.approve(review_id)


@router.post("/{review_id}/reject")
async def reject_review(review_id: EntityId, reviews: ReviewAdminDep) -> AdminReviewRead:
    return await reviews.reject(review_id)
