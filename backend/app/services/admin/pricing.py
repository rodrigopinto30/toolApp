from collections.abc import Mapping
from typing import Any

from app.core.exceptions import AppError, BusinessRuleViolation
from app.models import ExchangeRate, PickupPoint, Province, ShippingZone
from app.schemas.admin.pricing import (
    AdminExchangeRateRead,
    AdminPickupPointRead,
    AdminProvinceRead,
    AdminZoneRead,
)
from app.services.admin.base import AdminResource, taken


class ExchangeRateAdmin(AdminResource[ExchangeRate, AdminExchangeRateRead]):
    model = ExchangeRate
    read = AdminExchangeRateRead
    entity = "exchange_rate"
    fields = ("rate",)
    ordering = (ExchangeRate.id.desc(),)
    namespaces = ("pricing",)


class ZoneAdmin(AdminResource[ShippingZone, AdminZoneRead]):
    model = ShippingZone
    read = AdminZoneRead
    entity = "shipping_zone"
    fields = ("code", "name", "cost_usd", "free_over_usd", "eta_min_days", "eta_max_days", "is_active")
    ordering = (ShippingZone.id,)
    namespaces = ("shipping",)

    def conflict(self) -> AppError:
        return taken("code")

    async def validate(self, state: Mapping[str, Any], entity: ShippingZone | None) -> None:
        if state["eta_min_days"] > state["eta_max_days"]:
            raise BusinessRuleViolation(
                "The minimum delivery time cannot exceed the maximum.", code="invalid_eta_range"
            )


class ProvinceAdmin(AdminResource[Province, AdminProvinceRead]):
    model = Province
    read = AdminProvinceRead
    entity = "province"
    fields = ("shipping_zone_id",)
    ordering = (Province.name,)
    key = "code"
    namespaces = ("shipping",)

    def conflict(self) -> AppError:
        return BusinessRuleViolation("Unknown shipping zone.", code="unknown_zone")


class PickupPointAdmin(AdminResource[PickupPoint, AdminPickupPointRead]):
    model = PickupPoint
    read = AdminPickupPointRead
    entity = "pickup_point"
    fields = ("name", "address", "hours", "is_active")
    ordering = (PickupPoint.id,)
    namespaces = ("shipping",)
