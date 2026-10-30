from fastapi import APIRouter, Depends

from app.api.v1.admin import audit, catalog, coupons, pricing, products
from app.api.v1.deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
router.include_router(catalog.router)
router.include_router(products.router)
router.include_router(pricing.router)
router.include_router(coupons.router)
router.include_router(audit.router)
