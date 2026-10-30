from typing import Annotated, Self

from pydantic import AwareDatetime, Field

from app.models import DeliveryMethod, Locale, Order, OrderStatus, User
from app.schemas.admin.common import AdminPageParams
from app.schemas.common import ReadModel, RequestModel
from app.schemas.orders import OrderRead, OrderStatusChange, OrderSummary
from app.schemas.validators import text


class AdminOrderParams(AdminPageParams):
    status: OrderStatus | None = None
    number: str | None = Field(None, min_length=1, max_length=20)
    email: str | None = Field(None, min_length=1, max_length=254)
    date_from: AwareDatetime | None = None
    date_to: AwareDatetime | None = None


class OrderCustomer(ReadModel):
    id: int
    email: str
    first_name: str
    last_name: str


class AdminOrderSummary(OrderSummary):
    delivery_method: DeliveryMethod
    customer: OrderCustomer

    @classmethod
    def from_order(cls, summary: OrderSummary, order: Order, customer: User) -> Self:
        return cls(
            **summary.model_dump(),
            delivery_method=order.delivery_method,
            customer=OrderCustomer.model_validate(customer),
        )


class AdminStatusChange(OrderStatusChange, ReadModel):
    changed_by: int | None


class AdminOrderRead(OrderRead):
    locale: Locale
    customer: OrderCustomer
    next_statuses: list[OrderStatus]
    status_history: list[AdminStatusChange]

    @classmethod
    def from_order(
        cls, read: OrderRead, order: Order, customer: User, next_statuses: list[OrderStatus]
    ) -> Self:
        return cls(
            **read.model_dump(exclude={"status_history"}),
            locale=order.locale,
            customer=OrderCustomer.model_validate(customer),
            next_statuses=next_statuses,
            status_history=[
                AdminStatusChange.model_validate(change) for change in order.status_history
            ],
        )


class OrderStatusUpdate(RequestModel):
    status: OrderStatus
    note: Annotated[str, text(500)] | None = None
