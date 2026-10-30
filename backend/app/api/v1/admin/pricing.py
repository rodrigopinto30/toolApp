from typing import Annotated

from fastapi import APIRouter, Path, status

from app.api.v1.admin.deps import (
    EntityId,
    ExchangeRateAdminDep,
    PageParams,
    PickupPointAdminDep,
    ProvinceAdminDep,
    ZoneAdminDep,
)
from app.api.v1.deps import AdminUser
from app.schemas.admin.pricing import (
    AdminExchangeRateRead,
    AdminPickupPointRead,
    AdminProvinceRead,
    AdminZoneRead,
    ExchangeRateCreate,
    PickupPointCreate,
    PickupPointUpdate,
    ProvinceZoneUpdate,
    ZoneCreate,
    ZoneUpdate,
)
from app.schemas.common import Page

router = APIRouter()

ProvinceCode = Annotated[str, Path(min_length=1, max_length=8)]


@router.get("/exchange-rates")
async def list_exchange_rates(
    params: PageParams, rates: ExchangeRateAdminDep
) -> Page[AdminExchangeRateRead]:
    return await rates.page(params)


@router.post("/exchange-rates", status_code=status.HTTP_201_CREATED)
async def create_exchange_rate(
    body: ExchangeRateCreate, admin: AdminUser, rates: ExchangeRateAdminDep
) -> AdminExchangeRateRead:
    return await rates.create(body, created_by=admin.id)


@router.get("/zones")
async def list_zones(params: PageParams, zones: ZoneAdminDep) -> Page[AdminZoneRead]:
    return await zones.page(params)


@router.post("/zones", status_code=status.HTTP_201_CREATED)
async def create_zone(body: ZoneCreate, zones: ZoneAdminDep) -> AdminZoneRead:
    return await zones.create(body)


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: EntityId, zones: ZoneAdminDep) -> AdminZoneRead:
    return await zones.detail(zone_id)


@router.patch("/zones/{zone_id}")
async def update_zone(zone_id: EntityId, body: ZoneUpdate, zones: ZoneAdminDep) -> AdminZoneRead:
    return await zones.update(zone_id, body)


@router.delete("/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(zone_id: EntityId, zones: ZoneAdminDep) -> None:
    await zones.delete(zone_id)


@router.get("/provinces")
async def list_provinces(params: PageParams, provinces: ProvinceAdminDep) -> Page[AdminProvinceRead]:
    return await provinces.page(params)


@router.patch("/provinces/{code}")
async def update_province(
    code: ProvinceCode, body: ProvinceZoneUpdate, provinces: ProvinceAdminDep
) -> AdminProvinceRead:
    return await provinces.update(code, body)


@router.get("/pickup-points")
async def list_pickup_points(
    params: PageParams, points: PickupPointAdminDep
) -> Page[AdminPickupPointRead]:
    return await points.page(params)


@router.post("/pickup-points", status_code=status.HTTP_201_CREATED)
async def create_pickup_point(
    body: PickupPointCreate, points: PickupPointAdminDep
) -> AdminPickupPointRead:
    return await points.create(body)


@router.get("/pickup-points/{point_id}")
async def get_pickup_point(point_id: EntityId, points: PickupPointAdminDep) -> AdminPickupPointRead:
    return await points.detail(point_id)


@router.patch("/pickup-points/{point_id}")
async def update_pickup_point(
    point_id: EntityId, body: PickupPointUpdate, points: PickupPointAdminDep
) -> AdminPickupPointRead:
    return await points.update(point_id, body)


@router.delete("/pickup-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pickup_point(point_id: EntityId, points: PickupPointAdminDep) -> None:
    await points.delete(point_id)
