import asyncio

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict[str, str]:
    """The process is alive (dependencies are not checked)."""
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict[str, object]:
    """MySQL is required; if Redis is down the API keeps working without cache (degraded)."""
    state = request.app.state
    timeout = state.settings.health_check_timeout

    async def check_db() -> bool:
        async with state.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True

    async def check_redis() -> bool:
        return bool(await state.redis.ping())

    results: dict[str, str] = {}
    for name, check in (("mysql", check_db), ("redis", check_redis)):
        try:
            results[name] = "up" if await asyncio.wait_for(check(), timeout) else "down"
        except Exception:
            results[name] = "down"

    if results["mysql"] == "down":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        overall = "unavailable"
    elif results["redis"] == "down":
        overall = "degraded"
    else:
        overall = "ok"
    return {"status": overall, "checks": results}
