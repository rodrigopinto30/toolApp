from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.v1.params import CurrencyQuery, LocaleQuery, public_cache
from app.core.container import CatalogServiceDep
from app.models import Currency, Locale
from app.schemas.catalog import (
    AttributeRead,
    BrandRead,
    CategoryNode,
    ProductCard,
    ProductDetail,
    ProductSearchParams,
    Slug,
)
from app.schemas.common import Page

router = APIRouter(tags=["catalog"], dependencies=[Depends(public_cache)])


@router.get("/categories")
async def list_categories(
    service: CatalogServiceDep, locale: LocaleQuery = Locale.ES
) -> list[CategoryNode]:
    return await service.category_tree(locale)


@router.get("/brands")
async def list_brands(service: CatalogServiceDep) -> list[BrandRead]:
    return await service.brands()


@router.get("/attributes")
async def list_attributes(
    service: CatalogServiceDep, locale: LocaleQuery = Locale.ES
) -> list[AttributeRead]:
    return await service.attributes(locale)


@router.get("/products")
async def search_products(
    params: Annotated[ProductSearchParams, Query()], service: CatalogServiceDep
) -> Page[ProductCard]:
    return await service.search(params)


@router.get("/products/featured")
async def featured_products(
    service: CatalogServiceDep,
    locale: LocaleQuery = Locale.ES,
    currency: CurrencyQuery = Currency.ARS,
) -> list[ProductCard]:
    return await service.featured(locale, currency)


@router.get("/products/{slug}")
async def get_product(
    slug: Slug,
    service: CatalogServiceDep,
    locale: LocaleQuery = Locale.ES,
    currency: CurrencyQuery = Currency.ARS,
) -> ProductDetail:
    return await service.detail(slug, locale, currency)
