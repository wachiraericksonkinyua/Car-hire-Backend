"""Booking ORM model and its lifecycle statuses."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vehicle import Vehicle


class TripStatus(StrEnum):
    ASSIGNED = "Assigned"
    EN_ROUTE = "EnRoute"
    CUSTOMER_ONBOARD = "CustomerOnboard"
    COMPLETED = "Completed"


class BookingStatus(StrEnum):
    RESERVED = "Reserved"
    CONFIRMED = "Confirmed"
    CHECKED_OUT = "CheckedOut"
    OVERDUE = "Overdue"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    EXPIRED = "Expired"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    # Human-readable reference, e.g. BK-2612-0001.
    reference: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vehicles.id"), index=True, nullable=False
    )
    # Staff member who created the booking. NULL for public/guest bookings.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=True
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("driver_profiles.id"), index=True, nullable=True
    )

    trip_status: Mapped[TripStatus | None] = mapped_column(
        Enum(
            TripStatus,
            name="trip_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=True,
    )

    # Customer details live on the booking; customers do not log in.
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    customer_id_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    # Stored as an encrypted token once PII encryption is wired in.
    customer_id_number: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    pickup_location: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    pickup_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    return_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    # return_at + turnaround buffer; used by the exclusion constraint.
    block_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    total_kes: Mapped[int] = mapped_column(Integer, nullable=False)
    pricing_snapshot: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )

    # Offline approval details (Cash / M-Pesa Manual / Bank EFT / Corporate).
    payment_method: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    payment_reference: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    approval_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    status: Mapped[BookingStatus] = mapped_column(
        Enum(
            BookingStatus,
            name="booking_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=BookingStatus.RESERVED,
        index=True,
        nullable=False,
    )

    hold_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    with_chauffeur: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    vehicle: Mapped["Vehicle"] = relationship(back_populates="bookings")
    created_by: Mapped["User"] = relationship()
