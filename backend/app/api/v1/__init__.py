from fastapi import APIRouter

from app.api.v1 import auth, cart, catalog, checkout, me, pricing, shipping

api_router = APIRouter(prefix="/v1")
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(cart.router)
api_router.include_router(checkout.router)
api_router.include_router(catalog.router)
api_router.include_router(pricing.router)
api_router.include_router(shipping.router)
