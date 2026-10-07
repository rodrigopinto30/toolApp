from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Dialect, Enum, Numeric
from sqlalchemy.dialects import mysql
from sqlalchemy.engine.default import DefaultExecutionContext
from sqlalchemy.orm import mapped_column
from sqlalchemy.types import TypeDecorator, TypeEngine


def utcnow() -> datetime:
    return datetime.now(UTC)


def statement_utcnow(context: DefaultExecutionContext) -> datetime:
    """Column default: one timestamp per statement, so created_at == updated_at on insert
    (two separate utcnow() calls would differ by microseconds)."""
    now: datetime | None = getattr(context, "_statement_utcnow", None)
    if now is None:
        now = utcnow()
        context._statement_utcnow = now 
    return now


class UtcDateTime(TypeDecorator[datetime]):
    """Stores naive UTC in DATETIME(6) and always returns timezone-aware UTC datetimes.
    Naive datetimes are rejected on write, so local times can never sneak in."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[datetime]:
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=6))
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetime: use a timezone-aware UTC datetime.")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=UTC)


def str_enum(enum_cls: type[StrEnum], *, length: int = 32) -> Enum:
    """A VARCHAR column holding the enum values (no native MySQL ENUM: adding a value
    would need an ALTER that rewrites the table). Pair it with `enum_check`."""
    return Enum(
        enum_cls,
        native_enum=False,
        # The CHECK is declared explicitly with enum_check(): the type-bound one is
        # rendered twice by Alembic autogenerate.
        create_constraint=False,
        length=length,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


def enum_check(column_name: str, enum_cls: type[StrEnum]) -> CheckConstraint:
    """CHECK (<column> IN (<values>)), named ck_<table>_<column> by the naming convention."""
    values = ", ".join(f"'{member.value}'" for member in enum_cls)
    return CheckConstraint(f"`{column_name}` IN ({values})", name=column_name)


BigIntPk = Annotated[int, mapped_column(BigInteger, primary_key=True, autoincrement=True)]

# Money (see "Model conventions" in docs/plan-backend.md). Never float.
UsdAmount = Numeric(12, 2)  # base currency
OrderAmount = Numeric(14, 2)  # amounts in the order currency (ARS needs more digits)
ExchangeRateValue = Numeric(18, 6)  # ARS per 1 USD
