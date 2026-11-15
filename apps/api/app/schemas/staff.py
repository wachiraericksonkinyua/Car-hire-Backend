"""Staff management schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole
from app.utils.phone import normalize_kenyan_phone


class StaffCreate(BaseModel):
    email: EmailStr
    full_name: str
    phone: str | None = None
    role: UserRole
    password: str = Field(min_length=8)

    @field_validator("phone")
    @classmethod
    def _normalise_phone(cls, value: str | None) -> str | None:
        return normalize_kenyan_phone(value) if value else None


class StaffRoleUpdate(BaseModel):
    role: UserRole


class StaffStatusUpdate(BaseModel):
    is_active: bool


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    phone: str | None
    avatar_url: str | None = None
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
