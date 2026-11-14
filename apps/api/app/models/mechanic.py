"""Mechanic ORM model for roadside breakdown support."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Mechanic(Base):
    __tablename__ = "mechanics"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    garage: Mapped[str | None] = mapped_column(String(150), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Kenyan county where the mechanic usually works.
    county: Mapped[str] = mapped_column(String(50), nullable=False)
    town: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # InHouse / PartnerGarage / Towing
    mechanic_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    specialties: Mapped[list[str] | None] = mapped_column(
        JSONB, nullable=True
    )
    call_out_rate_kes: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    # GPS coordinates used to find the nearest mechanic to a breakdown.
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # Only available mechanics should be offered to customers.
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
