from fastapi import APIRouter

from app.api.v1 import catalog, pricing, shipping

api_router = APIRouter(prefix="/v1")
api_router.include_router(catalog.router)
api_router.include_router(pricing.router)
api_router.include_router(shipping.router)
