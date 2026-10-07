from decimal import Decimal

from sqlalchemy import JSON, BigInteger, CheckConstraint, ForeignKey, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, TimestampMixin
from app.db.types import BigIntPk, ExchangeRateValue, UsdAmount
from app.models.catalog import I18nLabel


class ExchangeRate(CreatedAtMixin, Base):
    """Append-only history: the current rate is the latest row (cached in Redis)."""

    __tablename__ = "exchange_rates"
    __table_args__ = (CheckConstraint("rate > 0", name="rate_positive"),)

    id: Mapped[BigIntPk]
    rate: Mapped[Decimal] = mapped_column(ExchangeRateValue)  # ARS per 1 USD
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)


class ShippingZone(TimestampMixin, Base):
    __tablename__ = "shipping_zones"
    __table_args__ = (
        CheckConstraint("cost_usd >= 0", name="cost_usd_non_negative"),
        CheckConstraint("free_over_usd IS NULL OR free_over_usd > 0", name="free_over_usd_positive"),
        CheckConstraint("eta_min_days >= 0 AND eta_min_days <= eta_max_days", name="eta_range"),
    )

    id: Mapped[BigIntPk]
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[I18nLabel] = mapped_column(JSON)
    cost_usd: Mapped[Decimal] = mapped_column(UsdAmount)
    free_over_usd: Mapped[Decimal | None] = mapped_column(UsdAmount)
    eta_min_days: Mapped[int]
    eta_max_days: Mapped[int]
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class Province(TimestampMixin, Base):
    __tablename__ = "provinces"

    id: Mapped[BigIntPk]
    name: Mapped[str] = mapped_column(String(80))
    code: Mapped[str] = mapped_column(String(8), unique=True)  # ISO 3166-2:AR
    shipping_zone_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("shipping_zones.id"), index=True
    )

    zone: Mapped["ShippingZone"] = relationship(lazy="raise")


class PickupPoint(TimestampMixin, Base):
    __tablename__ = "pickup_points"

    id: Mapped[BigIntPk]
    name: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(255))
    hours: Mapped[dict[str, str] | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
