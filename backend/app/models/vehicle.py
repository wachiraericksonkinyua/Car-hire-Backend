"""Vehicle ORM model.

Only the operational state is stored: Available or Maintenance. The API
derives Reserved/Rented from bookings for the requested date window.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.vehicle_photo import VehiclePhoto


class VehicleStatus(StrEnum):
    AVAILABLE = "Available"
    MAINTENANCE = "Maintenance"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    plate_number: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    brand: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    daily_rate_kes: Mapped[int] = mapped_column(Integer, nullable=False)
    # Refundable security deposit, untaxed in quotes.
    deposit_kes: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[VehicleStatus] = mapped_column(
        Enum(
            VehicleStatus,
            name="vehicle_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=VehicleStatus.AVAILABLE,
        index=True,
        nullable=False,
    )

    category: Mapped[str] = mapped_column(String(30), nullable=False)
    transmission: Mapped[str] = mapped_column(String(20), nullable=False)
    fuel: Mapped[str] = mapped_column(String(20), nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    bags: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    mileage_cap_km: Mapped[int] = mapped_column(Integer, nullable=False)
    insurance_expiry: Mapped[date] = mapped_column(Date, nullable=False)

    specs: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    bookings: Mapped[list["Booking"]] = relationship(back_populates="vehicle")
    photos: Mapped[list["VehiclePhoto"]] = relationship(
        back_populates="vehicle",
        cascade="all, delete-orphan",
    )
