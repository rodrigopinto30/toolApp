from fastapi import APIRouter, Depends

from app.api.v1.params import LocaleQuery, public_cache
from app.core.container import PricingServiceDep
from app.core.exceptions import ServiceUnavailableError
from app.models import Locale
from app.schemas.pricing import ExchangeRateRead, PickupPointRead, ProvinceRead

router = APIRouter(tags=["pricing"], dependencies=[Depends(public_cache)])


@router.get("/exchange-rate")
async def get_exchange_rate(service: PricingServiceDep) -> ExchangeRateRead:
    current = await service.current_rate()
    if current is None:
        raise ServiceUnavailableError("No exchange rate available.", code="exchange_rate_unavailable")
    return current


@router.get("/provinces")
async def list_provinces(
    service: PricingServiceDep, locale: LocaleQuery = Locale.ES
) -> list[ProvinceRead]:
    return await service.provinces(locale)


@router.get("/pickup-points")
async def list_pickup_points(service: PricingServiceDep) -> list[PickupPointRead]:
    return await service.pickup_points()
