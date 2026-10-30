from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.v1.admin.deps import CouponAdminDep, EntityId
from app.schemas.admin.common import AdminPageParams
from app.schemas.admin.coupons import AdminCouponRead, CouponCreate, CouponUpdate
from app.schemas.common import Page

router = APIRouter(prefix="/coupons")


@router.get("")
async def list_coupons(
    params: Annotated[AdminPageParams, Query()], coupons: CouponAdminDep
) -> Page[AdminCouponRead]:
    return await coupons.page(params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_coupon(body: CouponCreate, coupons: CouponAdminDep) -> AdminCouponRead:
    return await coupons.create(body)


@router.get("/{coupon_id}")
async def get_coupon(coupon_id: EntityId, coupons: CouponAdminDep) -> AdminCouponRead:
    return await coupons.detail(coupon_id)


@router.patch("/{coupon_id}")
async def update_coupon(
    coupon_id: EntityId, body: CouponUpdate, coupons: CouponAdminDep
) -> AdminCouponRead:
    return await coupons.update(coupon_id, body)


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coupon(coupon_id: EntityId, coupons: CouponAdminDep) -> None:
    await coupons.delete(coupon_id)
