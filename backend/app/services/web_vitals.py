import json
import math
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

MAX_PATH_LENGTH = 200
MAX_VALUE = 600_000
NAMES = frozenset({"CLS", "INP", "LCP"})
RATINGS = frozenset({"good", "needs-improvement", "poor"})
ORDER_NUMBER = re.compile(r"TA-\d{4}-\d+")


@dataclass(frozen=True)
class WebVital:
    name: str
    value: float
    rating: str
    path: str


def _choice(value: object, allowed: frozenset[str]) -> str | None:
    return value if isinstance(value, str) and value in allowed else None


def _path(value: object) -> str | None:
    if not isinstance(value, str) or not value.startswith("/"):
        return None
    try:
        path = urlsplit(value).path
    except ValueError:
        return None
    return ORDER_NUMBER.sub(":number", path)[:MAX_PATH_LENGTH]


def _value(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return round(value, 3) if math.isfinite(value) and 0 <= value <= MAX_VALUE else None


def parse_vital(body: bytes) -> WebVital | None:
    try:
        payload = json.loads(body)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    name = _choice(payload.get("name"), NAMES)
    rating = _choice(payload.get("rating"), RATINGS)
    value, path = _value(payload.get("value")), _path(payload.get("path"))
    if name is None or rating is None or value is None or path is None:
        return None
    return WebVital(name=name, value=value, rating=rating, path=path)
