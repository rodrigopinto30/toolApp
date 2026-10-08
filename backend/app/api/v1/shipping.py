from fastapi import APIRouter

from app.api.v1.params import LocaleQuery
from app.core.container import ShippingServiceDep
from app.models import Locale
from app.schemas.shipping import ShippingQuoteRead, ShippingQuoteRequest

router = APIRouter(prefix="/shipping", tags=["shipping"])


@router.post("/quote")
async def quote_shipping(
    request: ShippingQuoteRequest, service: ShippingServiceDep, locale: LocaleQuery = Locale.ES
) -> ShippingQuoteRead:
    return await service.quote(request, locale)
