from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

MASK = "***"
SENSITIVE = ("password", "token", "hash", "secret")


def snapshot(entity: object, fields: Iterable[str]) -> dict[str, Any]:
    return {field: getattr(entity, field) for field in fields}


def plain(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [plain(item) for item in value]
    return value


def _is_sensitive(field: str) -> bool:
    name = field.lower()
    return any(word in name for word in SENSITIVE)


def diff(before: Mapping[str, Any], after: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    changes: dict[str, dict[str, Any]] = {}
    for field in sorted(before.keys() | after.keys()):
        old, new = before.get(field), after.get(field)
        if old == new:
            continue
        if _is_sensitive(field):
            changes[field] = {"before": MASK, "after": MASK}
        else:
            changes[field] = {"before": plain(old), "after": plain(new)}
    return changes


@dataclass(frozen=True)
class AuditTrail:
    actor_id: int
    ip: str
    request_id: str | None

    def record(
        self,
        session: AsyncSession,
        action: str,
        entity: str,
        entity_id: int | str,
        changes: dict[str, dict[str, Any]],
    ) -> None:
        session.add(
            AuditLog(
                actor_id=self.actor_id,
                action=action,
                entity=entity,
                entity_id=str(entity_id),
                changes=changes,
                ip=self.ip,
                request_id=self.request_id,
            )
        )
