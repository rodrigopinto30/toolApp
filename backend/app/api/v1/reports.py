from dataclasses import asdict

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.v1.deps import ip_rate_limit
from app.services.csp_reports import parse_reports
from app.services.web_vitals import parse_vital

MAX_REPORT_BYTES = 16_384
MAX_VITAL_BYTES = 1_024

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["reports"], include_in_schema=False)


@router.post(
    "/csp-reports",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(ip_rate_limit("csp-report", limit=60, window=60))],
)
async def receive_csp_report(request: Request) -> None:
    body = await request.body()
    if len(body) > MAX_REPORT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE)
    for violation in parse_reports(body):
        logger.warning("csp_violation", **asdict(violation))


@router.post(
    "/web-vitals",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(ip_rate_limit("web-vital", limit=120, window=60))],
)
async def receive_web_vital(request: Request) -> None:
    body = await request.body()
    if len(body) > MAX_VITAL_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE)
    vital = parse_vital(body)
    if vital is not None:
        logger.info("web_vital", **asdict(vital))
