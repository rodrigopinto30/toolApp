from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models import Currency, DeliveryMethod, OrderStatus, PaymentStatus, TaxCondition, TaxIdType
from app.schemas.account import ProvinceRef
from app.schemas.checkout import AppliedCoupon
from app.schemas.common import Money, ReadModel
from app.schemas.pricing import PickupPointRead, ZoneRead


class OrderAddress(ReadModel):
    label: str
    recipient_name: str
    phone: str
    street: str
    number: str
    floor_apt: str | None
    city: str
    province: ProvinceRef
    postal_code: str
    notes: str | None


class ZoneSnapshot(ReadModel):
    code: str
    name: dict[str, str]
    eta_min_days: int
    eta_max_days: int


class ShippingSnapshot(OrderAddress):
    zone: ZoneSnapshot


class OrderBilling(ReadModel):
    tax_id_type: TaxIdType
    tax_id: str
    tax_condition: TaxCondition
    legal_name: str
    fiscal_address: str


class OrderItemRead(BaseModel):
    variant_id: int
    sku: str
    product_name: str
    variant_label: str | None
    quantity: int
    unit_price: Money
    line_total: Money


class OrderDelivery(BaseModel):
    method: DeliveryMethod
    address: OrderAddress | None
    zone: ZoneRead | None
    pickup_point: PickupPointRead | None


class OrderStatusChange(BaseModel):
    from_status: OrderStatus | None
    to_status: OrderStatus
    note: str | None
    created_at: datetime


class PaymentRead(BaseModel):
    status: PaymentStatus
    amount: Money
    brand: str | None
    last4: str | None
    created_at: datetime


class OrderRead(BaseModel):
    number: str
    status: OrderStatus
    currency: Currency
    exchange_rate: Decimal
    items: list[OrderItemRead]
    subtotal: Money
    discount_total: Money
    shipping_total: Money
    total: Money
    coupon: AppliedCoupon | None
    delivery: OrderDelivery
    billing: OrderBilling | None
    status_history: list[OrderStatusChange]
    payments: list[PaymentRead]
    created_at: datetime
    paid_at: datetime | None
    cancelled_at: datetime | None
