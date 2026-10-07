from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Computed, ForeignKey, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.types import BigIntPk, enum_check, str_enum

if TYPE_CHECKING:
    from app.models.pricing import Province


class UserRole(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class TaxIdType(StrEnum):
    DNI = "DNI"
    CUIT = "CUIT"


class TaxCondition(StrEnum):
    """Argentine tax (AFIP) conditions; stored values are the official terms."""

    FINAL_CONSUMER = "consumidor_final"
    MONOTRIBUTO = "monotributo"
    REGISTERED = "responsable_inscripto"
    EXEMPT = "exento"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (enum_check("role", UserRole),)

    id: Mapped[BigIntPk]
    # Unique and case-insensitive (utf8mb4_0900_ai_ci); the service also lowercases it.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))  # Argon2id
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(30))
    role: Mapped[UserRole] = mapped_column(
        str_enum(UserRole), default=UserRole.CUSTOMER, server_default=UserRole.CUSTOMER
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    email_verified_at: Mapped[datetime | None]
    last_login_at: Mapped[datetime | None]


class Address(TimestampMixin, Base):
    __tablename__ = "addresses"

    id: Mapped[BigIntPk]
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(40))
    recipient_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30))
    street: Mapped[str] = mapped_column(String(120))
    number: Mapped[str] = mapped_column(String(20))
    floor_apt: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(80))
    province_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("provinces.id"), index=True)
    postal_code: Mapped[str] = mapped_column(String(10))
    notes: Mapped[str | None] = mapped_column(String(255))
    is_default: Mapped[bool] = mapped_column(default=False, server_default="0")
    # user_id when is_default, else NULL: the unique index allows one default per user
    # (MySQL has no partial indexes; NULLs do not collide). Read-only, computed by MySQL.
    default_user_id: Mapped[int | None] = mapped_column(
        BigInteger, Computed("if(is_default, user_id, null)", persisted=False), unique=True
    )

    province: Mapped["Province"] = relationship(lazy="raise")


class BillingProfile(TimestampMixin, Base):
    __tablename__ = "billing_profiles"
    __table_args__ = (
        enum_check("tax_id_type", TaxIdType),
        enum_check("tax_condition", TaxCondition),
    )

    id: Mapped[BigIntPk]
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    tax_id_type: Mapped[TaxIdType] = mapped_column(str_enum(TaxIdType, length=8))
    tax_id: Mapped[str] = mapped_column(String(11))  # digits only; CUIT check digit validated
    tax_condition: Mapped[TaxCondition] = mapped_column(str_enum(TaxCondition))
    legal_name: Mapped[str] = mapped_column(String(160))
    fiscal_address: Mapped[str] = mapped_column(String(255))
    is_default: Mapped[bool] = mapped_column(default=False, server_default="0")
    default_user_id: Mapped[int | None] = mapped_column(
        BigInteger, Computed("if(is_default, user_id, null)", persisted=False), unique=True
    )
