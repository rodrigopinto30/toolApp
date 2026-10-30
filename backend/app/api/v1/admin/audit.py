from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1.admin.deps import AuditLogAdminDep
from app.schemas.admin.audit import AuditLogParams, AuditLogRead
from app.schemas.common import Page

router = APIRouter(prefix="/audit-logs")


@router.get("")
async def list_audit_logs(
    params: Annotated[AuditLogParams, Query()], logs: AuditLogAdminDep
) -> Page[AuditLogRead]:
    return await logs.page(params)
