from uuid import uuid4

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    validate_password,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    password = "A-strong-password-42"
    encoded = hash_password(password)
    assert password not in encoded
    assert verify_password(password, encoded)
    assert not verify_password("wrong-password", encoded)


@pytest.mark.parametrize("password", ["short", "alllowercasebutlong1", "ALLUPPERCASEBUTLONG1", "NoNumbersAtAll"])
def test_password_policy_rejects_weak_passwords(password: str) -> None:
    with pytest.raises(ValueError):
        validate_password(password)


def test_access_token_contains_bound_user_and_session() -> None:
    user_id, session_id = uuid4(), uuid4()
    token, expires_at = create_access_token(user_id, session_id)
    assert expires_at.tzinfo is not None
    assert decode_access_token(token) == (user_id, session_id)


def test_wrong_token_type_is_rejected() -> None:
    from app.core.config import settings

    token = jwt.encode(
        {"typ": "refresh", "sub": str(uuid4()), "sid": str(uuid4())},
        settings.APP_SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_refresh_tokens_are_random_and_only_hash_is_stable() -> None:
    first, first_hash = new_refresh_token()
    second, _ = new_refresh_token()
    assert first != second
    assert first_hash == hash_refresh_token(first)
    assert first not in first_hash
