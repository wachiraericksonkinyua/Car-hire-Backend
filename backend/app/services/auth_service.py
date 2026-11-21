"""Authentication logic: password check and refresh-token lifecycle."""

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.utils.time import utc_now

# A real Argon2 hash of an arbitrary value. When the email does not exist we
# still verify against this hash, so a missing email and a wrong password take
# roughly the same time.
_DUMMY_HASH = hash_password("timing-attack-dummy-password")


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> User | None:
    """Return the matching user, or None if credentials are invalid."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


async def issue_refresh_token(
    db: AsyncSession, user: User
) -> tuple[str, RefreshToken]:
    """Create a refresh-token row and return (raw token, row).

    Only the hash is persisted. Caller commits the transaction.
    """
    settings = get_settings()
    raw = generate_refresh_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        auth_version=user.auth_version,
        expires_at=utc_now()
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(row)
    await db.flush()
    return raw, row


async def find_refresh_token(
    db: AsyncSession, raw_token: str
) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    row = await find_refresh_token(db, raw_token)
    if row is not None and row.revoked_at is None:
        row.revoked_at = utc_now()


async def revoke_all_refresh_tokens(
    db: AsyncSession, user_id
) -> None:
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=utc_now())
    )
