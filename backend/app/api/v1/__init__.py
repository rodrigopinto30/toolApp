from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    cart,
    catalog,
    checkout,
    favorites,
    me,
    orders,
    pricing,
    reviews,
    shipping,
)

api_router = APIRouter(prefix="/v1")
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(cart.router)
api_router.include_router(cart.guest_router)
api_router.include_router(checkout.router)
api_router.include_router(orders.router)
api_router.include_router(catalog.router)
api_router.include_router(reviews.router)
api_router.include_router(favorites.router)
api_router.include_router(pricing.router)
api_router.include_router(shipping.router)
api_router.include_router(admin.router)
