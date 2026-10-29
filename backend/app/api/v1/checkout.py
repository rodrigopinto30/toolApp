from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.v1.deps import VerifiedUser, user_rate_limit
from app.api.v1.params import IdempotencyKey, LocaleQuery
from app.core.container import CheckoutServiceDep
from app.core.exceptions import error_response, get_request_id
from app.models import Locale
from app.schemas.checkout import CheckoutPreviewRead, CheckoutPreviewRequest, CheckoutRequest
from app.schemas.orders import OrderRead
from app.services.checkout import CheckoutOutcome

router = APIRouter(prefix="/checkout", tags=["checkout"])

OUTCOME_STATUS = {
    CheckoutOutcome.PAID: status.HTTP_201_CREATED,
    CheckoutOutcome.PENDING: status.HTTP_202_ACCEPTED,
    CheckoutOutcome.EXISTING: status.HTTP_200_OK,
}


@router.post("/preview")
async def preview_checkout(
    body: CheckoutPreviewRequest,
    user: VerifiedUser,
    checkout: CheckoutServiceDep,
    locale: LocaleQuery = Locale.ES,
) -> CheckoutPreviewRead:
    return await checkout.preview(user.id, body, locale)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=OrderRead,
    responses={
        200: {"model": OrderRead, "description": "The order already placed with this key"},
        202: {"model": OrderRead, "description": "Order created, payment still pending"},
        402: {"description": "Payment rejected: the order was cancelled"},
    },
    dependencies=[Depends(user_rate_limit("checkout", limit=10, window=600))],
)
async def place_order(
    body: CheckoutRequest,
    user: VerifiedUser,
    idempotency_key: IdempotencyKey,
    request: Request,
    response: Response,
    checkout: CheckoutServiceDep,
    locale: LocaleQuery = Locale.ES,
) -> OrderRead | JSONResponse:
    result = await checkout.checkout(user, body, idempotency_key, locale)
    if result.outcome == CheckoutOutcome.REJECTED:
        return error_response(
            get_request_id(request),
            status.HTTP_402_PAYMENT_REQUIRED,
            "payment_rejected",
            "The payment was rejected.",
            details={"order_number": result.order.number},
        )
    response.status_code = OUTCOME_STATUS[result.outcome]
    return result.order
