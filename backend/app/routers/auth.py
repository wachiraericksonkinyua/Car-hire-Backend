"""Authentication routes: login, refresh, logout, me.

The access token is returned in the response body (the client keeps it in
memory). The refresh token is set as an HttpOnly cookie, stored only as a hash,
and rotated on every use.
"""

from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_payload
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import check_login_rate_limit, clear_login_rate_limit
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse
from app.schemas.common import SuccessEnvelope
from app.services.auth_service import (
    authenticate_user,
    find_refresh_token,
    issue_refresh_token,
    revoke_refresh_token,
)
from app.services.image_service import delete_image_file, read_image
from app.utils.time import as_utc, utc_now

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=True,
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
    )


def _token_response(user: User, access_token: str) -> dict:
    settings = get_settings()
    return {
        "data": TokenResponse(
            access_token=access_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user),
        )
    }


@router.post("/login", response_model=SuccessEnvelope[TokenResponse])
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{payload.email.lower()}"
    check_login_rate_limit(
        rate_key,
        max_attempts=settings.LOGIN_RATE_LIMIT_ATTEMPTS,
        window_seconds=settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    )

    user = await authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    clear_login_rate_limit(rate_key)
    user.last_login_at = utc_now()

    raw_refresh, _row = await issue_refresh_token(db, user)
    await db.flush()

    _set_refresh_cookie(response, raw_refresh)
    access = create_access_token(
        str(user.id), user.role.value, user.auth_version
    )
    return _token_response(user, access)


@router.post("/refresh", response_model=SuccessEnvelope[TokenResponse])
async def refresh_access_token(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None, alias=REFRESH_COOKIE_NAME
    ),
    db: AsyncSession = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    row = await find_refresh_token(db, refresh_token)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if row.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    if as_utc(row.expires_at) <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    user = await db.get(User, row.user_id)
    if (
        user is None
        or not user.is_active
        or row.auth_version != user.auth_version
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is no longer valid",
        )

    new_raw, new_row = await issue_refresh_token(db, user)
    row.revoked_at = utc_now()
    row.replaced_by_id = new_row.id
    await db.flush()

    _set_refresh_cookie(response, new_raw)
    access = create_access_token(
        str(user.id), user.role.value, user.auth_version
    )
    return _token_response(user, access)


@router.post("/logout", response_model=SuccessEnvelope[dict])
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None, alias=REFRESH_COOKIE_NAME
    ),
    db: AsyncSession = Depends(get_db),
):
    if refresh_token:
        await revoke_refresh_token(db, refresh_token)
        await db.flush()

    _clear_refresh_cookie(response)
    return {"data": {"message": "Logged out"}}


@router.get("/me", response_model=SuccessEnvelope[UserResponse])
async def read_current_user(
    user: User = Depends(get_current_user),
):
    return {"data": user}


@router.post("/me/avatar", response_model=SuccessEnvelope[UserResponse])
async def upload_current_user_avatar(
    file: UploadFile = File(...),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db),
):
    """Upload or replace the current user's profile picture."""
    user = await db.get(User, UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    content, content_type = await read_image(file)
    previous = user.avatar_url
    user.avatar_data = content
    user.avatar_content_type = content_type
    user.avatar_url = f"/public/profile-photos/users/{user.id}?v={uuid4().hex}"
    await db.flush()
    await db.refresh(user)
    delete_image_file(previous)
    return {"data": user}
