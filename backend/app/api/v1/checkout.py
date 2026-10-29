from fastapi import APIRouter

from app.api.v1.deps import VerifiedUser
from app.api.v1.params import LocaleQuery
from app.core.container import CheckoutServiceDep
from app.models import Locale
from app.schemas.checkout import CheckoutPreviewRead, CheckoutPreviewRequest

router = APIRouter(prefix="/checkout", tags=["checkout"])


@router.post("/preview")
async def preview_checkout(
    body: CheckoutPreviewRequest,
    user: VerifiedUser,
    checkout: CheckoutServiceDep,
    locale: LocaleQuery = Locale.ES,
) -> CheckoutPreviewRead:
    return await checkout.preview(user.id, body, locale)
