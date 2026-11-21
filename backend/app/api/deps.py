"""Reusable FastAPI dependencies for authentication and authorization."""

from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate the Bearer token and load the current active user."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Deactivation and role changes bump auth_version, invalidating old tokens.
    if (
        payload.get("ver") != user.auth_version
        or payload.get("role") != user.role.value
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated; log in again",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


async def get_current_user_payload(
    user: User = Depends(get_current_user),
) -> dict:
    """Return the authenticated claims used by permission dependencies."""
    return {
        "sub": str(user.id),
        "role": user.role.value,
        "ver": user.auth_version,
    }


def require_role(*allowed_roles: str):
    """Dependency factory that only lets the listed roles through.

    Prefer `require_permission(...)` for new routes; this remains for simple
    role-only checks.
    """

    def checker(
        payload: dict = Depends(get_current_user_payload),
    ) -> dict:
        if payload.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return payload

    return checker
