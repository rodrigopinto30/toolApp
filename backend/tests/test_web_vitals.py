import json

import pytest
import structlog
from httpx import AsyncClient

from app.services.web_vitals import MAX_PATH_LENGTH, WebVital, parse_vital

URL = "/api/v1/web-vitals"
VITAL = {"name": "LCP", "value": 1234.5678, "rating": "good", "path": "/es/products/taladro"}


def parsed(**changes: object) -> WebVital | None:
    return parse_vital(json.dumps(VITAL | changes).encode())


def test_reads_a_metric() -> None:
    assert parsed() == WebVital(
        name="LCP", value=1234.568, rating="good", path="/es/products/taladro"
    )


@pytest.mark.parametrize("name", ["LCP", "INP", "CLS"])
def test_accepts_the_three_metrics(name: str) -> None:
    assert parsed(name=name) is not None


def test_keeps_the_small_values_of_cls() -> None:
    vital = parsed(name="CLS", value=0.0123)

    assert vital is not None
    assert vital.value == 0.012


def test_accepts_zero() -> None:
    vital = parsed(name="CLS", value=0)

    assert vital is not None
    assert vital.value == 0


def test_hides_the_order_number() -> None:
    vital = parsed(path="/es/account/orders/TA-2026-000123")

    assert vital is not None
    assert vital.path == "/es/account/orders/:number"


def test_drops_the_query_and_the_fragment() -> None:
    vital = parsed(path="/es/search?q=secret#top")

    assert vital is not None
    assert vital.path == "/es/search"


def test_cuts_a_long_path() -> None:
    vital = parsed(path="/" + "x" * 1000)

    assert vital is not None
    assert len(vital.path) == MAX_PATH_LENGTH


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "TTFB"},
        {"name": None},
        {"name": ["LCP"]},
        {"rating": "great"},
        {"rating": None},
        {"rating": ["good"]},
        {"value": -1},
        {"value": 600_001},
        {"value": True},
        {"value": "12"},
        {"value": None},
        {"path": "https://evil.test/x"},
        {"path": "no-slash"},
        {"path": 7},
        {"path": None},
    ],
)
def test_rejects_a_bad_field(changes: dict[str, object]) -> None:
    assert parsed(**changes) is None


@pytest.mark.parametrize("body", [b"not json", b"\xff\xfe", b"null", b"[]", b"12", b"{}"])
def test_rejects_anything_else(body: bytes) -> None:
    assert parse_vital(body) is None


def test_rejects_a_value_json_cannot_really_hold() -> None:
    assert parse_vital(b'{"name":"LCP","value":NaN,"rating":"good","path":"/es"}') is None
    assert parse_vital(b'{"name":"LCP","value":Infinity,"rating":"good","path":"/es"}') is None


async def test_logs_a_metric_and_answers_no_content(raw_client: AsyncClient) -> None:
    with structlog.testing.capture_logs() as logs:
        response = await raw_client.post(
            URL, content=json.dumps(VITAL), headers={"Content-Type": "text/plain;charset=UTF-8"}
        )

    assert response.status_code == 204
    [entry] = [log for log in logs if log["event"] == "web_vital"]
    assert entry["name"] == "LCP"
    assert set(entry) == {"event", "log_level", "name", "value", "rating", "path"}


async def test_a_session_cookie_needs_no_csrf_token(raw_client: AsyncClient) -> None:
    raw_client.cookies.set("__Host-access", "anything")

    response = await raw_client.post(URL, content=json.dumps(VITAL))

    assert response.status_code == 204


async def test_a_bad_body_still_answers_no_content(raw_client: AsyncClient) -> None:
    with structlog.testing.capture_logs() as logs:
        response = await raw_client.post(URL, content=b"not json")

    assert response.status_code == 204
    assert not any(log["event"] == "web_vital" for log in logs)


async def test_rejects_a_large_body(raw_client: AsyncClient) -> None:
    response = await raw_client.post(URL, content=b"x" * 1_025)

    assert response.status_code == 413


async def test_limits_metrics_per_ip(raw_client: AsyncClient) -> None:
    statuses = [(await raw_client.post(URL, content=b"{}")).status_code for _ in range(121)]

    assert statuses[:120] == [204] * 120
    assert statuses[120] == 429
