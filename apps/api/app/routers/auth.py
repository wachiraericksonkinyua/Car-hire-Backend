"""Authentication routes: login sets a cookie, /me reads it back."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_payload
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, UserResponse
from app.services.auth_service import authenticate_user

router = APIRouter(prefix="/auth", tags=["auth"])

# The cookie name the browser will store. HttpOnly means JavaScript cannot
# read it, which protects the token from XSS-based theft.
COOKIE_NAME = "access_token"
COOKIE_MAX_AGE_SECONDS = 60 * 60  # one hour, matching the token lifetime


def _set_access_token_cookie(response: Response, token: str) -> None:
    """Attach the JWT as a hardened, HttpOnly cookie."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
    )


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(db, payload.email, payload.password)

    if user is None:
        # Deliberately vague: do not reveal whether the email or password
        # was the part that was wrong.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(str(user.id), user.role.value)
    _set_access_token_cookie(response, token)

    return user


@router.get("/me", response_model=UserResponse)
async def read_current_user(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db),
):
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user
