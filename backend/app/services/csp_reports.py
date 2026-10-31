import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

MAX_REPORTS = 20
MAX_TEXT_LENGTH = 200
WEB_SCHEMES = frozenset({"http", "https"})


@dataclass(frozen=True)
class CspViolation:
    document: str
    blocked: str
    directive: str
    disposition: str
    source: str
    line: int | None
    column: int | None


def _text(value: object) -> str:
    return value[:MAX_TEXT_LENGTH] if isinstance(value, str) else ""


def _location(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        parts = urlsplit(value)
    except ValueError:
        return ""
    if parts.scheme in WEB_SCHEMES:
        host = parts.netloc.rpartition("@")[2]
        return _text(f"{parts.scheme}://{host}{parts.path}")
    return _text(parts.scheme or value)


def _number(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _violation(entry: dict[str, Any]) -> CspViolation:
    return CspViolation(
        document=_location(entry.get("document-uri") or entry.get("documentURL")),
        blocked=_location(entry.get("blocked-uri") or entry.get("blockedURL")),
        directive=_text(
            entry.get("effective-directive")
            or entry.get("effectiveDirective")
            or entry.get("violated-directive")
        ),
        disposition=_text(entry.get("disposition")),
        source=_location(entry.get("source-file") or entry.get("sourceFile")),
        line=_number(entry.get("line-number") or entry.get("lineNumber")),
        column=_number(entry.get("column-number") or entry.get("columnNumber")),
    )


def parse_reports(body: bytes) -> list[CspViolation]:
    try:
        payload = json.loads(body)
    except ValueError:
        return []
    if isinstance(payload, dict):
        entries = [payload.get("csp-report")]
    elif isinstance(payload, list):
        entries = [
            item.get("body")
            for item in payload[:MAX_REPORTS]
            if isinstance(item, dict) and item.get("type") == "csp-violation"
        ]
    else:
        return []
    return [_violation(entry) for entry in entries if isinstance(entry, dict)]
