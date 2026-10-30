from collections.abc import Mapping
from typing import Any

from app.core.exceptions import AppError, BusinessRuleViolation, ConflictError
from app.models import Coupon, CouponType, Order
from app.schemas.admin.coupons import AdminCouponRead
from app.services.admin.base import AdminResource, code_taken

FROZEN_ONCE_USED = ("code", "type", "value")


class CouponAdmin(AdminResource[Coupon, AdminCouponRead]):
    model = Coupon
    read = AdminCouponRead
    entity = "coupon"
    fields = (
        "code",
        "type",
        "value",
        "min_subtotal_usd",
        "starts_at",
        "ends_at",
        "max_uses",
        "max_uses_per_user",
        "is_active",
    )
    ordering = (Coupon.id.desc(),)

    def conflict(self) -> AppError:
        return code_taken()

    async def validate(self, state: Mapping[str, Any], entity: Coupon | None) -> None:
        if entity is not None and await self._freezes(state, entity):
            raise ConflictError(
                "The code, type and value of a used coupon cannot change.", code="coupon_used"
            )
        if state["type"] == CouponType.PERCENT and state["value"] > 100:
            raise BusinessRuleViolation(
                "A percent coupon cannot exceed 100.", code="invalid_coupon_value"
            )
        if state["ends_at"] is not None and state["ends_at"] <= state["starts_at"]:
            raise BusinessRuleViolation(
                "A coupon must end after it starts.", code="invalid_coupon_period"
            )

    async def _freezes(self, state: Mapping[str, Any], coupon: Coupon) -> bool:
        if all(state[field] == getattr(coupon, field) for field in FROZEN_ONCE_USED):
            return False
        return await self.uow.repository(Order).exists(coupon_id=coupon.id)
