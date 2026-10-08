from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.core.config import Settings
from app.core.exceptions import BusinessRuleViolation
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.pricing import ProvinceRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import DeliveryMethod, Locale, ShippingZone
from app.schemas.common import Money
from app.schemas.pricing import PickupPointRead, ZoneRead
from app.schemas.shipping import ShippingQuoteRead, ShippingQuoteRequest
from app.services.pricing import PricingService

ZERO = Decimal("0.00")


@dataclass(frozen=True)
class ShippingCost:
    cost_usd: Decimal
    eta_min_days: int
    eta_max_days: int

    @property
    def is_free(self) -> bool:
        return self.cost_usd == 0


class ShippingStrategy(Protocol):
    def calculate(self, subtotal_usd: Decimal) -> ShippingCost: ...


class PickupShipping:
    def calculate(self, subtotal_usd: Decimal) -> ShippingCost:
        return ShippingCost(ZERO, 0, 0)


@dataclass(frozen=True)
class ZoneShipping:
    cost_usd: Decimal
    free_over_usd: Decimal | None
    eta_min_days: int
    eta_max_days: int

    @classmethod
    def from_zone(cls, zone: ShippingZone) -> "ZoneShipping":
        return cls(zone.cost_usd, zone.free_over_usd, zone.eta_min_days, zone.eta_max_days)

    def calculate(self, subtotal_usd: Decimal) -> ShippingCost:
        is_free = self.free_over_usd is not None and subtotal_usd >= self.free_over_usd
        cost = ZERO if is_free else self.cost_usd
        return ShippingCost(cost, self.eta_min_days, self.eta_max_days)


class ShippingService:
    def __init__(self, uow: SqlAlchemyUnitOfWork, pricing: PricingService, settings: Settings) -> None:
        self.uow = uow
        self.pricing = pricing
        self.settings = settings

    async def quote(self, request: ShippingQuoteRequest, locale: Locale) -> ShippingQuoteRead:
        converter = await self.pricing.converter(request.currency)
        quantities = {item.variant_id: item.quantity for item in request.items}

        strategy: ShippingStrategy = PickupShipping()
        zone: ZoneRead | None = None
        async with self.uow:
            variants = await ProductRepository(self.uow.session).active_variants(list(quantities))
            missing = sorted(set(quantities) - {variant.id for variant in variants})
            if missing:
                raise BusinessRuleViolation(
                    "Some items are not available.",
                    code="unavailable_items",
                    details={"variant_ids": missing},
                )
            if request.delivery_method == DeliveryMethod.SHIPPING:
                province = await ProvinceRepository(self.uow.session).get_with_zone(
                    request.province_code or ""
                )
                if province is None or not province.zone.is_active:
                    raise BusinessRuleViolation("Unknown province.", code="unknown_province")
                strategy = ZoneShipping.from_zone(province.zone)
                zone = ZoneRead(
                    code=province.zone.code,
                    name=province.zone.name[locale],
                    eta_min_days=province.zone.eta_min_days,
                    eta_max_days=province.zone.eta_max_days,
                )

        subtotal_usd = sum((v.price_usd * quantities[v.id] for v in variants), ZERO)
        subtotal = sum(
            (converter.from_usd(v.price_usd, request.currency) * quantities[v.id] for v in variants),
            Decimal(0),
        )
        cost = strategy.calculate(subtotal_usd)
        pickup_points: list[PickupPointRead] = []
        if request.delivery_method == DeliveryMethod.PICKUP:
            pickup_points = await self.pricing.pickup_points()

        return ShippingQuoteRead(
            delivery_method=request.delivery_method,
            subtotal=Money(amount=subtotal, currency=request.currency),
            cost=converter.money(cost.cost_usd, request.currency),
            is_free=cost.is_free,
            eta_min_days=cost.eta_min_days,
            eta_max_days=cost.eta_max_days,
            zone=zone,
            pickup_points=pickup_points,
        )
