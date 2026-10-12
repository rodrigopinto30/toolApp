from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    new_token,
    password_needs_rehash,
    verify_password,
)


def test_hash_and_verify() -> None:
    password_hash = hash_password("correct horse")

    assert password_hash.startswith("$argon2id$")
    assert verify_password(password_hash, "correct horse")
    assert not verify_password(password_hash, "wrong")
    assert not password_needs_rehash(password_hash)


def test_verify_rejects_garbage_hash() -> None:
    assert not verify_password("not-a-hash", "anything")


def _token(settings: Settings, **overrides: object) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": "7",
        "role": "customer",
        "sid": "family",
        "typ": "access",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    payload.update(overrides)
    return jwt.encode(payload, settings.jwt_key, algorithm="HS256")


def test_access_token_round_trip(settings: Settings) -> None:
    token = create_access_token(settings, user_id=7, role="admin", session_id="family")

    claims = decode_access_token(settings, token)

    assert (claims.user_id, claims.role, claims.session_id) == (7, "admin", "family")


def test_expired_access_token(settings: Settings) -> None:
    past = datetime.now(UTC) - timedelta(hours=1)
    token = create_access_token(settings, user_id=7, role="customer", session_id="f", now=past)

    with pytest.raises(UnauthorizedError) as error:
        decode_access_token(settings, token)
    assert error.value.code == "token_expired"


@pytest.mark.parametrize(
    "overrides",
    [
        {"iss": "someone-else"},
        {"aud": "another-api"},
        {"typ": "refresh"},
        {"sub": "not-a-number"},
    ],
)
def test_rejects_tampered_claims(settings: Settings, overrides: dict[str, object]) -> None:
    with pytest.raises(UnauthorizedError) as error:
        decode_access_token(settings, _token(settings, **overrides))
    assert error.value.code == "unauthorized"


def test_rejects_other_key_and_algorithm(settings: Settings) -> None:
    forged = jwt.encode({"sub": "1"}, "x" * 32, algorithm="HS256")
    unsigned = jwt.encode({"sub": "1"}, None, algorithm="none")

    for token in (forged, unsigned, "garbage"):
        with pytest.raises(UnauthorizedError):
            decode_access_token(settings, token)


def test_random_tokens_and_hash() -> None:
    token = new_token()

    assert len(token) >= 43 and token != new_token()
    assert hash_token(token) == hash_token(token)
    assert len(hash_token(token)) == 64
