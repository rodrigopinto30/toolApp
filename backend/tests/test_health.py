from httpx import AsyncClient


async def test_live(client: AsyncClient) -> None:
    response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_reports_dependencies(client: AsyncClient) -> None:
    response = await client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"mysql": "up", "redis": "up"}}


async def test_responses_carry_request_id_and_no_store(client: AsyncClient) -> None:
    response = await client.get("/api/health/live")

    assert len(response.headers["X-Request-ID"]) == 32
    assert response.headers["Cache-Control"] == "no-store"
