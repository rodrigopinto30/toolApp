from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.v1.checkout import PAYMENT_RESPONSES, payment_response
from app.api.v1.deps import CurrentUser, VerifiedUser
from app.api.v1.params import IdempotencyKey, LocaleQuery
from app.core.container import CheckoutServiceDep, OrderServiceDep
from app.models import Locale
from app.schemas.common import Page
from app.schemas.orders import OrderListParams, OrderPaymentRequest, OrderRead, OrderSummary
from app.services.checkout import CheckoutOutcome

router = APIRouter(prefix="/me/orders", tags=["orders"])

OrderNumber = Annotated[str, Path(min_length=1, max_length=20)]

PAY_STATUS = {
    CheckoutOutcome.PAID: status.HTTP_200_OK,
    CheckoutOutcome.PENDING: status.HTTP_202_ACCEPTED,
    CheckoutOutcome.EXISTING: status.HTTP_200_OK,
}


@router.get("")
async def list_orders(
    user: CurrentUser, orders: OrderServiceDep, params: Annotated[OrderListParams, Query()]
) -> Page[OrderSummary]:
    return await orders.page(user.id, params)


@router.get("/{number}")
async def get_order(
    number: OrderNumber, user: CurrentUser, orders: OrderServiceDep, locale: LocaleQuery = Locale.ES
) -> OrderRead:
    return await orders.detail(user.id, number, locale)


@router.post("/{number}/cancel")
async def cancel_order(
    number: OrderNumber, user: CurrentUser, orders: OrderServiceDep, locale: LocaleQuery = Locale.ES
) -> OrderRead:
    return await orders.cancel(user, number, locale)


@router.post("/{number}/pay", response_model=OrderRead, responses=PAYMENT_RESPONSES)
async def pay_order(
    number: OrderNumber,
    body: OrderPaymentRequest,
    user: VerifiedUser,
    idempotency_key: IdempotencyKey,
    request: Request,
    response: Response,
    checkout: CheckoutServiceDep,
    locale: LocaleQuery = Locale.ES,
) -> OrderRead | JSONResponse:
    result = await checkout.pay(user, number, body.payment.card(), idempotency_key, locale)
    return payment_response(result, request, response, PAY_STATUS)
