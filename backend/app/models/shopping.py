from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, TimestampMixin
from app.db.types import BigIntPk, ExchangeRateValue, OrderAmount, UsdAmount, enum_check, str_enum


class CouponType(StrEnum):
    PERCENT = "percent"
    FIXED = "fixed"  # amount in USD


class OrderStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    PREPARING = "preparing"
    SHIPPED = "shipped"
    READY_FOR_PICKUP = "ready_for_pickup"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class Currency(StrEnum):
    ARS = "ARS"
    USD = "USD"


class DeliveryMethod(StrEnum):
    PICKUP = "pickup"
    SHIPPING = "shipping"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REFUNDED = "refunded"


class Cart(TimestampMixin, Base):
    """Server-side cart of a logged-in user (a guest cart lives in the browser)."""

    __tablename__ = "carts"

    id: Mapped[BigIntPk]
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", cascade="all, delete-orphan", lazy="raise"
    )


class CartItem(TimestampMixin, Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    id: Mapped[BigIntPk]
    cart_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("carts.id", ondelete="CASCADE"))
    variant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    quantity: Mapped[int]

    cart: Mapped["Cart"] = relationship(back_populates="items", lazy="raise")


class Coupon(TimestampMixin, Base):
    __tablename__ = "coupons"
    __table_args__ = (
        enum_check("type", CouponType),
        CheckConstraint("value > 0", name="value_positive"),
        CheckConstraint("type <> 'percent' OR value <= 100", name="percent_max_100"),
        CheckConstraint("used_count >= 0", name="used_count_non_negative"),
        CheckConstraint("max_uses IS NULL OR max_uses > 0", name="max_uses_positive"),
        CheckConstraint(
            "max_uses_per_user IS NULL OR max_uses_per_user > 0", name="max_uses_per_user_positive"
        ),
        CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="valid_period"),
    )

    id: Mapped[BigIntPk]
    code: Mapped[str] = mapped_column(String(40), unique=True)  # stored uppercase
    type: Mapped[CouponType] = mapped_column(str_enum(CouponType, length=16))
    value: Mapped[Decimal] = mapped_column(UsdAmount)  # percent, or USD amount if fixed
    min_subtotal_usd: Mapped[Decimal | None] = mapped_column(UsdAmount)
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime | None]
    max_uses: Mapped[int | None]
    max_uses_per_user: Mapped[int | None]
    used_count: Mapped[int] = mapped_column(default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class CouponRedemption(TimestampMixin, Base):
    __tablename__ = "coupon_redemptions"
    __table_args__ = (
        Index("ix_coupon_redemptions_coupon_id_user_id", "coupon_id", "user_id"),
    )

    id: Mapped[BigIntPk]
    coupon_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("coupons.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id"), unique=True)


class Order(TimestampMixin, Base):
    """Prices, exchange rate, address and billing data are frozen when the order is created."""

    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key"),
        Index("ix_orders_user_id_created_at", "user_id", "created_at"),
        Index("ix_orders_status_created_at", "status", "created_at"),
        enum_check("status", OrderStatus),
        enum_check("currency", Currency),
        enum_check("delivery_method", DeliveryMethod),
        CheckConstraint("exchange_rate > 0", name="exchange_rate_positive"),
        CheckConstraint(
            "subtotal >= 0 AND discount_total >= 0 AND shipping_total >= 0 AND total >= 0",
            name="amounts_non_negative",
        ),
    )

    id: Mapped[BigIntPk]
    number: Mapped[str] = mapped_column(String(20), unique=True)  # TA-2026-000123
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[OrderStatus] = mapped_column(
        str_enum(OrderStatus),
        default=OrderStatus.PENDING_PAYMENT,
        server_default=OrderStatus.PENDING_PAYMENT,
    )
    currency: Mapped[Currency] = mapped_column(str_enum(Currency, length=3))
    exchange_rate: Mapped[Decimal] = mapped_column(ExchangeRateValue)
    subtotal: Mapped[Decimal] = mapped_column(OrderAmount)
    discount_total: Mapped[Decimal] = mapped_column(OrderAmount)
    shipping_total: Mapped[Decimal] = mapped_column(OrderAmount)
    total: Mapped[Decimal] = mapped_column(OrderAmount)
    coupon_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("coupons.id"), index=True)
    delivery_method: Mapped[DeliveryMethod] = mapped_column(
        str_enum(DeliveryMethod, length=16)
    )
    shipping_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    billing_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    pickup_point_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("pickup_points.id"), index=True
    )
    notes: Mapped[str | None] = mapped_column(String(500))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    paid_at: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="raise"
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        cascade="all, delete-orphan", order_by="OrderStatusHistory.id", lazy="raise"
    )
    payments: Mapped[list["Payment"]] = relationship(
        cascade="all, delete-orphan", order_by="Payment.id", lazy="raise"
    )


class OrderItem(TimestampMixin, Base):
    """Snapshot of the purchased variant, in the order currency."""

    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0 AND line_total >= 0", name="amounts_non_negative"),
    )

    id: Mapped[BigIntPk]
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id"), index=True)
    variant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product_variants.id"), index=True
    )
    sku: Mapped[str] = mapped_column(String(64))
    product_name: Mapped[str] = mapped_column(String(200))
    variant_label: Mapped[str | None] = mapped_column(String(200))
    unit_price: Mapped[Decimal] = mapped_column(OrderAmount)
    quantity: Mapped[int]
    line_total: Mapped[Decimal] = mapped_column(OrderAmount)

    order: Mapped["Order"] = relationship(back_populates="items", lazy="raise")


class OrderStatusHistory(CreatedAtMixin, Base):
    __tablename__ = "order_status_history"
    __table_args__ = (
        enum_check("from_status", OrderStatus),
        enum_check("to_status", OrderStatus),
    )

    id: Mapped[BigIntPk]
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id"), index=True)
    from_status: Mapped[OrderStatus | None] = mapped_column(str_enum(OrderStatus))
    to_status: Mapped[OrderStatus] = mapped_column(str_enum(OrderStatus))
    changed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    note: Mapped[str | None] = mapped_column(String(500))


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("provider", "provider_ref"),
        enum_check("status", PaymentStatus),
        enum_check("currency", Currency),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )

    id: Mapped[BigIntPk]
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # "mock"
    provider_ref: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[PaymentStatus] = mapped_column(
        str_enum(PaymentStatus, length=16),
        default=PaymentStatus.PENDING,
        server_default=PaymentStatus.PENDING,
    )
    amount: Mapped[Decimal] = mapped_column(OrderAmount)
    currency: Mapped[Currency] = mapped_column(str_enum(Currency, length=3))
    raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSON)  # sanitized
