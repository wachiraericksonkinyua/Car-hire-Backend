"""Reusable FastAPI dependencies for authentication and authorization."""

import jwt
from fastapi import Cookie, Depends, HTTPException, status

from app.core.security import decode_access_token


def get_current_user_payload(
    access_token: str | None = Cookie(default=None),
) -> dict:
    """Read the HttpOnly `access_token` cookie and return the JWT claims.

    If the cookie is missing, invalid, or expired we raise 401 Unauthorized.
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    try:
        return decode_access_token(access_token)
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def require_role(*allowed_roles: str):
    """Dependency factory that only lets the listed roles through.

    Usage: `Depends(require_role("admin", "manager"))`.
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
