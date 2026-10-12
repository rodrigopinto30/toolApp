import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError

ACCESS_COOKIE = "__Host-access"
REFRESH_COOKIE = "refresh"
CSRF_COOKIE = "csrf"
CSRF_HEADER = "X-CSRF-Token"

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@cache
def dummy_password_hash() -> str:
    """Verified when the email does not exist, so both cases take about the same time."""
    return hash_password(secrets.token_urlsafe(16))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class AccessClaims:
    user_id: int
    role: str
    session_id: str


def create_access_token(
    settings: Settings, *, user_id: int, role: str, session_id: str, now: datetime | None = None
) -> str:
    issued_at = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "sid": session_id,
        "typ": ACCESS_TOKEN_TYPE,
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=settings.access_token_ttl),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_key, algorithm=JWT_ALGORITHM)


def decode_access_token(settings: Settings, token: str) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_key,
            algorithms=[JWT_ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "sub", "sid", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("The session has expired.", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError() from exc

    subject = payload["sub"]
    if payload.get("typ") != ACCESS_TOKEN_TYPE or not str(subject).isdigit():
        raise UnauthorizedError()
    return AccessClaims(
        user_id=int(subject), role=str(payload.get("role")), session_id=str(payload["sid"])
    )
