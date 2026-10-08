from decimal import ROUND_HALF_UP, Decimal

from app.cache.decorators import Cache, cached
from app.core.config import Settings
from app.core.exceptions import ServiceUnavailableError
from app.db.repositories.pricing import (
    ExchangeRateRepository,
    PickupPointRepository,
    ProvinceRepository,
)
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Currency, Locale
from app.schemas.common import Money
from app.schemas.pricing import ExchangeRateRead, PickupPointRead, ProvinceRead, ZoneRead

CENT = Decimal("0.01")


class PriceConverter:
    def __init__(self, rate: Decimal | None, *, ars_rounding_step: int = 1) -> None:
        self.rate = rate
        self.step = Decimal(ars_rounding_step)

    def require_rate(self) -> Decimal:
        if self.rate is None:
            raise ServiceUnavailableError(
                "Prices in ARS are temporarily unavailable.", code="exchange_rate_unavailable"
            )
        return self.rate

    def from_usd(self, amount_usd: Decimal, currency: Currency) -> Decimal:
        if currency == Currency.USD:
            return amount_usd.quantize(CENT, ROUND_HALF_UP)
        steps = (amount_usd * self.require_rate() / self.step).quantize(Decimal(1), ROUND_HALF_UP)
        return steps * self.step

    def to_usd(self, amount: Decimal, currency: Currency) -> Decimal:
        if currency == Currency.USD:
            return amount
        return (amount / self.require_rate()).quantize(Decimal("0.000001"), ROUND_HALF_UP)

    def money(self, amount_usd: Decimal, currency: Currency) -> Money:
        return Money(amount=self.from_usd(amount_usd, currency), currency=currency)

    def convert(self, money: Money | None, currency: Currency) -> Money | None:
        return None if money is None else self.money(money.amount, currency)


class PricingService:
    def __init__(self, uow: SqlAlchemyUnitOfWork, cache: Cache, settings: Settings) -> None:
        self.uow = uow
        self.cache = cache
        self.settings = settings

    @cached("pricing", ttl_setting="cache_ttl_pricing")
    async def current_rate(self) -> ExchangeRateRead | None:
        async with self.uow:
            latest = await ExchangeRateRepository(self.uow.session).latest()
        if latest is None:
            return None
        return ExchangeRateRead(rate=latest.rate, updated_at=latest.created_at)

    async def converter(self, currency: Currency) -> PriceConverter:
        step = self.settings.ars_rounding_step
        if currency == Currency.USD:
            return PriceConverter(None, ars_rounding_step=step)
        current = await self.current_rate()
        converter = PriceConverter(current.rate if current else None, ars_rounding_step=step)
        converter.require_rate()
        return converter

    @cached("shipping", ttl_setting="cache_ttl_shipping")
    async def provinces(self, locale: Locale) -> list[ProvinceRead]:
        async with self.uow:
            provinces = await ProvinceRepository(self.uow.session).list_with_zone()
            return [
                ProvinceRead(
                    code=province.code,
                    name=province.name,
                    zone=ZoneRead(
                        code=province.zone.code,
                        name=province.zone.name[locale],
                        eta_min_days=province.zone.eta_min_days,
                        eta_max_days=province.zone.eta_max_days,
                    ),
                )
                for province in provinces
            ]

    @cached("shipping", ttl_setting="cache_ttl_shipping")
    async def pickup_points(self) -> list[PickupPointRead]:
        async with self.uow:
            points = await PickupPointRepository(self.uow.session).list_active()
            return [
                PickupPointRead(id=p.id, name=p.name, address=p.address, hours=p.hours)
                for p in points
            ]
