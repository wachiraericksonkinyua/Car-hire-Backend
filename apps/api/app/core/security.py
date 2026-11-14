"""Security helpers: password hashing, JWTs, and PII encryption."""

from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from pwdlib import PasswordHash

from app.core.config import get_settings

# `recommended()` currently selects Argon2, the modern password-hashing
# algorithm. It is deliberately slow, which makes brute-force attacks costly.
password_hash = PasswordHash.recommended()

# JWT settings. We sign with a symmetric secret and a fixed algorithm.
ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    """Turn a plain-text password into an Argon2 hash. This is one-way."""
    return password_hash.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if `plain` matches the stored hash, else False."""
    return password_hash.verify(plain, hashed)


def create_access_token(
    user_id: str,
    role: str,
    expires_minutes: int = 60,
) -> str:
    """Create a signed JWT containing the user's id and role."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, get_settings().JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Verify a JWT's signature and expiry, then return its claims.

    Raises `jwt.InvalidTokenError` if the token is malformed, tampered with,
    or expired. Callers are expected to translate that into an HTTP 401.
    """
    return jwt.decode(
        token,
        get_settings().JWT_SECRET,
        algorithms=[ALGORITHM],
    )


def _fernet() -> Fernet:
    """Build a Fernet instance from the validated encryption key."""
    return Fernet(get_settings().ENCRYPTION_KEY.encode())


def encrypt_pii(plain: str) -> str:
    """Encrypt sensitive data (national ID, licence number) for storage."""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_pii(token: str) -> str:
    """Decrypt a value previously produced by `encrypt_pii`."""
    return _fernet().decrypt(token.encode()).decode()
