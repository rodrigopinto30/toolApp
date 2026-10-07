from typing import Any

from sqlalchemy import JSON, BigInteger, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin
from app.db.types import BigIntPk


class AuditLog(CreatedAtMixin, Base):
    """Append-only record of every admin action (OWASP A09)."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity_entity_id", "entity", "entity_id"),
        Index("ix_audit_logs_actor_id_created_at", "actor_id", "created_at"),
    )

    id: Mapped[BigIntPk]
    actor_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    changes: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(45))
    request_id: Mapped[str | None] = mapped_column(String(64))
