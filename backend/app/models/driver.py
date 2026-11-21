"""Driver profiles and availability status."""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import User


class DriverStatus(StrEnum):
    AVAILABLE = "Available"
    ASSIGNED = "Assigned"
    OFF_DUTY = "OffDuty"


class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), unique=True, index=True, nullable=False
    )

    licence_class: Mapped[str] = mapped_column(String(10), nullable=False)
    licence_expiry: Mapped[date] = mapped_column(Date, nullable=False)
    psv_expiry: Mapped[date] = mapped_column(Date, nullable=False)

    status: Mapped[DriverStatus] = mapped_column(
        Enum(
            DriverStatus,
            name="driver_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=DriverStatus.AVAILABLE,
        index=True,
        nullable=False,
    )

    languages: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Optional driver photo served from /uploads.
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship()
