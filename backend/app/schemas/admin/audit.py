from datetime import datetime
from typing import Any

from pydantic import AwareDatetime, BaseModel, Field

from app.schemas.admin.common import AdminPageParams


class AuditLogParams(AdminPageParams):
    actor_id: int | None = Field(None, gt=0)
    entity: str | None = Field(None, max_length=60)
    entity_id: str | None = Field(None, max_length=64)
    action: str | None = Field(None, max_length=60)
    date_from: AwareDatetime | None = None
    date_to: AwareDatetime | None = None


class AuditChange(BaseModel):
    before: Any
    after: Any


class AuditLogRead(BaseModel):
    id: int
    actor_id: int | None
    actor_email: str | None
    action: str
    entity: str
    entity_id: str | None
    changes: dict[str, AuditChange] | None
    ip: str | None
    request_id: str | None
    created_at: datetime
