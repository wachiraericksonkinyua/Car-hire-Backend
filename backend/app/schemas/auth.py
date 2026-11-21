"""Pydantic schemas for authentication requests and responses."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class LoginRequest(BaseModel):
    """Body of the login request. Email is validated for correct format."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Public user data we are comfortable returning to the browser.

    Note: `password_hash` is intentionally absent.
    """

    # `from_attributes=True` lets us validate directly from a SQLAlchemy
    # `User` object (`UserResponse.model_validate(user)`).
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool


class TokenResponse(BaseModel):
    """Access token held in memory by the client, plus the current user."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
