import json

import pytest
import structlog
from httpx import AsyncClient

from app.services.csp_reports import MAX_REPORTS, MAX_TEXT_LENGTH, CspViolation, parse_reports

URL = "/api/v1/csp-reports"
LEGACY_REPORT = {
    "csp-report": {
        "document-uri": "https://shop.test/es/cart?coupon=SECRET#top",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://user:pass@evil.test/x.js?token=abc",
        "disposition": "enforce",
        "source-file": "https://shop.test/_next/static/a.js?v=1",
        "line-number": 12,
        "column-number": 34,
    }
}
REPORTING_API_BATCH = [
    {
        "type": "csp-violation",
        "url": "https://shop.test/es",
        "body": {
            "documentURL": "https://shop.test/es?page=2",
            "blockedURL": "inline",
            "effectiveDirective": "script-src-elem",
            "disposition": "report",
            "sourceFile": "https://shop.test/_next/static/b.js",
            "lineNumber": 1,
            "columnNumber": 2,
        },
    },
    {"type": "deprecation", "body": {"id": "something-else"}},
]


def reports(payload: object) -> list[CspViolation]:
    return parse_reports(json.dumps(payload).encode())


def test_reads_the_legacy_format_without_queries_or_credentials() -> None:
    assert reports(LEGACY_REPORT) == [
        CspViolation(
            document="https://shop.test/es/cart",
            blocked="https://evil.test/x.js",
            directive="script-src-elem",
            disposition="enforce",
            source="https://shop.test/_next/static/a.js",
            line=12,
            column=34,
        )
    ]


def test_reads_a_reporting_api_batch_and_skips_other_report_types() -> None:
    assert reports(REPORTING_API_BATCH) == [
        CspViolation(
            document="https://shop.test/es",
            blocked="inline",
            directive="script-src-elem",
            disposition="report",
            source="https://shop.test/_next/static/b.js",
            line=1,
            column=2,
        )
    ]


def test_falls_back_to_the_violated_directive() -> None:
    parsed = reports({"csp-report": {"violated-directive": "img-src"}})

    assert parsed[0].directive == "img-src"


def test_keeps_only_the_scheme_of_data_and_blob_urls() -> None:
    parsed = reports({"csp-report": {"blocked-uri": "data:text/html;base64,c2VjcmV0"}})

    assert parsed[0].blocked == "data"


def test_truncates_long_values() -> None:
    parsed = reports({"csp-report": {"effective-directive": "x" * 1000}})

    assert len(parsed[0].directive) == MAX_TEXT_LENGTH


def test_stops_at_the_report_limit() -> None:
    batch = [{"type": "csp-violation", "body": {}}] * (MAX_REPORTS + 5)

    assert len(reports(batch)) == MAX_REPORTS


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"\xff\xfe",
        b"null",
        b"12",
        b'"text"',
        b"{}",
        b'{"csp-report": "text"}',
        b'[1, "two", null]',
        b'[{"type": "csp-violation", "body": "text"}]',
    ],
)
def test_ignores_anything_else(body: bytes) -> None:
    assert parse_reports(body) == []


@pytest.mark.parametrize("value", [["list"], {"a": 1}, 7, True, None])
def test_survives_wrong_types(value: object) -> None:
    fields = ["document-uri", "blocked-uri", "effective-directive", "line-number", "source-file"]

    parsed = reports({"csp-report": dict.fromkeys(fields, value)})

    assert parsed[0].document == parsed[0].blocked == parsed[0].directive == ""
    assert parsed[0].line == (7 if value == 7 else None)


def test_survives_a_malformed_url() -> None:
    assert reports({"csp-report": {"blocked-uri": "http://[broken"}})[0].blocked == ""


async def test_logs_a_violation_and_answers_no_content(raw_client: AsyncClient) -> None:
    with structlog.testing.capture_logs() as logs:
        response = await raw_client.post(
            URL,
            content=json.dumps(LEGACY_REPORT),
            headers={"Content-Type": "application/csp-report"},
        )

    assert response.status_code == 204
    [entry] = [log for log in logs if log["event"] == "csp_violation"]
    assert entry["blocked"] == "https://evil.test/x.js"
    assert "SECRET" not in str(entry) and "token=abc" not in str(entry)


async def test_accepts_the_reporting_api_content_type(raw_client: AsyncClient) -> None:
    with structlog.testing.capture_logs() as logs:
        response = await raw_client.post(
            URL,
            content=json.dumps(REPORTING_API_BATCH),
            headers={"Content-Type": "application/reports+json"},
        )

    assert response.status_code == 204
    assert sum(log["event"] == "csp_violation" for log in logs) == 1


async def test_a_session_cookie_needs_no_csrf_token(raw_client: AsyncClient) -> None:
    raw_client.cookies.set("__Host-access", "anything")

    response = await raw_client.post(URL, content=b"{}")

    assert response.status_code == 204


async def test_a_foreign_origin_is_not_blocked(raw_client: AsyncClient) -> None:
    response = await raw_client.post(URL, content=b"{}", headers={"Origin": "null"})

    assert response.status_code == 204


async def test_a_bad_body_still_answers_no_content(raw_client: AsyncClient) -> None:
    with structlog.testing.capture_logs() as logs:
        response = await raw_client.post(URL, content=b"not json")

    assert response.status_code == 204
    assert not any(log["event"] == "csp_violation" for log in logs)


async def test_rejects_a_large_body(raw_client: AsyncClient) -> None:
    response = await raw_client.post(URL, content=b"x" * 16_385)

    assert response.status_code == 413
    assert response.json()["code"] == "payload_too_large"


async def test_limits_reports_per_ip(raw_client: AsyncClient) -> None:
    statuses = [(await raw_client.post(URL, content=b"{}")).status_code for _ in range(61)]

    assert statuses[:60] == [204] * 60
    assert statuses[60] == 429


async def test_other_csrf_protected_routes_stay_protected(raw_client: AsyncClient) -> None:
    raw_client.cookies.set("__Host-access", "anything")

    response = await raw_client.post("/api/v1/me/cart/merge", json={"items": []})

    assert response.status_code == 403
