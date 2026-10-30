from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.v1.admin.deps import EntityId, ProductAdminDep, VariantAdminDep
from app.schemas.admin.products import (
    AdminProductRead,
    AdminProductSummary,
    AdminVariantRead,
    ProductCreate,
    ProductListParams,
    ProductUpdate,
    StockAdjustment,
    VariantCreate,
    VariantUpdate,
)
from app.schemas.common import Page

router = APIRouter()


@router.get("/products")
async def list_products(
    params: Annotated[ProductListParams, Query()], products: ProductAdminDep
) -> Page[AdminProductSummary]:
    return await products.search(params)


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, products: ProductAdminDep) -> AdminProductRead:
    return await products.create(body)


@router.get("/products/{product_id}")
async def get_product(product_id: EntityId, products: ProductAdminDep) -> AdminProductRead:
    return await products.detail(product_id)


@router.patch("/products/{product_id}")
async def update_product(
    product_id: EntityId, body: ProductUpdate, products: ProductAdminDep
) -> AdminProductRead:
    return await products.update(product_id, body)


@router.post("/products/{product_id}/archive")
async def archive_product(product_id: EntityId, products: ProductAdminDep) -> AdminProductRead:
    return await products.archive(product_id)


@router.post("/products/{product_id}/variants", status_code=status.HTTP_201_CREATED)
async def create_variant(
    product_id: EntityId, body: VariantCreate, variants: VariantAdminDep
) -> AdminVariantRead:
    return await variants.create(body, product_id=product_id)


@router.patch("/variants/{variant_id}")
async def update_variant(
    variant_id: EntityId, body: VariantUpdate, variants: VariantAdminDep
) -> AdminVariantRead:
    return await variants.update(variant_id, body)


@router.post("/variants/{variant_id}/archive")
async def archive_variant(variant_id: EntityId, variants: VariantAdminDep) -> AdminVariantRead:
    return await variants.archive(variant_id)


@router.post("/variants/{variant_id}/stock")
async def adjust_stock(
    variant_id: EntityId, body: StockAdjustment, variants: VariantAdminDep
) -> AdminVariantRead:
    return await variants.adjust_stock(variant_id, body)
