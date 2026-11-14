"""The User model and the roles a user can hold.

This is a single-company system, so there is deliberately no tenant_id.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# StrEnum means each member is both an enum and a plain string, which is
# convenient for JSON responses and comparisons.
class UserRole(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    AGENT = "agent"
    DRIVER = "driver"
    MECHANIC = "mechanic"
    CUSTOMER = "customer"


class User(Base):
    __tablename__ = "users"

    # UUID primary key generated in Python before the insert.
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    # Emails must be unique, and an index makes lookups by email fast.
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # We store only the hash, never the plain-text password.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Stored as a database enum using the lowercase string values above.
    # New users default to the lowest-privilege role.
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=UserRole.CUSTOMER,
        index=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # The database fills this in with NOW() at insert time.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
