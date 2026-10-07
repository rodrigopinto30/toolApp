from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.types import BigIntPk, enum_check, str_enum


class ReviewStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Review(TimestampMixin, Base):
    """Only buyers with a delivered order can review (service rule). Approval by an admin."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("product_id", "user_id"),
        Index("ix_reviews_product_id_status", "product_id", "status"),
        enum_check("status", ReviewStatus),
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
    )

    id: Mapped[BigIntPk]
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.id"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    rating: Mapped[int] = mapped_column(SmallInteger)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[ReviewStatus] = mapped_column(
        str_enum(ReviewStatus, length=16),
        default=ReviewStatus.PENDING,
        server_default=ReviewStatus.PENDING,
    )


class Favorite(TimestampMixin, Base):
    __tablename__ = "favorites"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True, index=True
    )
