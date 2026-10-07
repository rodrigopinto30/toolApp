from app.core.security import hash_password, password_needs_rehash, verify_password


def test_hash_and_verify() -> None:
    password_hash = hash_password("correct horse")

    assert password_hash.startswith("$argon2id$")
    assert verify_password(password_hash, "correct horse")
    assert not verify_password(password_hash, "wrong")
    assert not password_needs_rehash(password_hash)


def test_verify_rejects_garbage_hash() -> None:
    assert not verify_password("not-a-hash", "anything")
