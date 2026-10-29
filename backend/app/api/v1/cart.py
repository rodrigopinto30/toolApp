from typing import Annotated

from fastapi import APIRouter, Path, status

from app.api.v1.deps import CurrentUser
from app.api.v1.params import CurrencyQuery, LocaleQuery
from app.core.container import CartServiceDep
from app.models import Currency, Locale
from app.schemas.cart import (
    CartItemUpdate,
    CartMergeRead,
    CartMergeRequest,
    CartQuoteRequest,
    CartRead,
)

router = APIRouter(prefix="/me/cart", tags=["cart"])
guest_router = APIRouter(prefix="/cart", tags=["cart"])

VariantId = Annotated[int, Path(gt=0)]


@router.get("")
async def get_cart(
    user: CurrentUser,
    cart: CartServiceDep,
    currency: CurrencyQuery = Currency.ARS,
    locale: LocaleQuery = Locale.ES,
) -> CartRead:
    return await cart.get(user.id, currency, locale)


@router.put("/items/{variant_id}")
async def set_cart_item(
    variant_id: VariantId,
    body: CartItemUpdate,
    user: CurrentUser,
    cart: CartServiceDep,
    currency: CurrencyQuery = Currency.ARS,
    locale: LocaleQuery = Locale.ES,
) -> CartRead:
    return await cart.set_quantity(user.id, variant_id, body.quantity, currency, locale)


@router.delete("/items/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_cart_item(variant_id: VariantId, user: CurrentUser, cart: CartServiceDep) -> None:
    await cart.remove(user.id, variant_id)


@router.post("/merge")
async def merge_cart(
    body: CartMergeRequest,
    user: CurrentUser,
    cart: CartServiceDep,
    currency: CurrencyQuery = Currency.ARS,
    locale: LocaleQuery = Locale.ES,
) -> CartMergeRead:
    return await cart.merge(user.id, body, currency, locale)


@guest_router.post("/quote")
async def quote_cart(
    body: CartQuoteRequest,
    cart: CartServiceDep,
    currency: CurrencyQuery = Currency.ARS,
    locale: LocaleQuery = Locale.ES,
) -> CartRead:
    return await cart.quote(body, currency, locale)
