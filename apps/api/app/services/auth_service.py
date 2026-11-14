"""Business logic for authenticating users."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User

# A real Argon2 hash of an arbitrary value. When the email does not exist we
# still verify against this hash, so a missing email and a wrong password take
# roughly the same time. This prevents attackers from discovering which emails
# are registered by measuring response times.
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
        # Burn the same amount of CPU as a real verification, then fail.
        verify_password(password, _DUMMY_HASH)
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user
