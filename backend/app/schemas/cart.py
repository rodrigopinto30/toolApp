from enum import StrEnum

from pydantic import BaseModel, Field

from app.models import Currency
from app.schemas.catalog import ImageRead, StockStatus
from app.schemas.common import MAX_LINE_QUANTITY, MAX_LINES, Money, RequestModel


class CartLineIssue(StrEnum):
    UNAVAILABLE = "unavailable"
    OUT_OF_STOCK = "out_of_stock"
    INSUFFICIENT_STOCK = "insufficient_stock"


class CartAdjustmentReason(StrEnum):
    UNAVAILABLE = "unavailable"
    INSUFFICIENT_STOCK = "insufficient_stock"
    CART_LIMIT = "cart_limit"


class CartItemUpdate(RequestModel):
    quantity: int = Field(ge=1, le=MAX_LINE_QUANTITY)


class CartMergeItem(RequestModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=MAX_LINE_QUANTITY)


class CartMergeRequest(RequestModel):
    items: list[CartMergeItem] = Field(max_length=MAX_LINES)


class CartLine(BaseModel):
    variant_id: int
    sku: str
    product_slug: str
    product_name: str
    variant_label: str | None
    image: ImageRead | None
    quantity: int
    unit_price: Money
    line_total: Money
    stock_status: StockStatus
    issue: CartLineIssue | None
    available: int | None


class CartRead(BaseModel):
    items: list[CartLine]
    item_count: int
    subtotal: Money
    has_issues: bool
    currency: Currency


class CartAdjustment(BaseModel):
    variant_id: int
    requested: int
    applied: int
    reason: CartAdjustmentReason


class CartMergeRead(BaseModel):
    cart: CartRead
    adjustments: list[CartAdjustment]
