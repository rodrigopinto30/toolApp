from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1.admin.deps import OrderAdminDep
from app.api.v1.params import OrderNumber
from app.schemas.admin.orders import (
    AdminOrderParams,
    AdminOrderRead,
    AdminOrderSummary,
    OrderStatusUpdate,
)
from app.schemas.common import Page

router = APIRouter(prefix="/orders")


@router.get("")
async def list_orders(
    params: Annotated[AdminOrderParams, Query()], orders: OrderAdminDep
) -> Page[AdminOrderSummary]:
    return await orders.search(params)


@router.get("/{number}")
async def get_order(number: OrderNumber, orders: OrderAdminDep) -> AdminOrderRead:
    return await orders.detail(number)


@router.post("/{number}/status")
async def change_order_status(
    number: OrderNumber, body: OrderStatusUpdate, orders: OrderAdminDep
) -> AdminOrderRead:
    return await orders.change_status(number, body)
