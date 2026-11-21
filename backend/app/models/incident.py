"""Breakdown incidents and mechanic dispatch."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IncidentStatus(StrEnum):
    OPEN = "Open"
    DISPATCHED = "Dispatched"
    EN_ROUTE = "EnRoute"
    RESOLVED = "Resolved"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vehicles.id"), index=True, nullable=False
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("bookings.id"), index=True, nullable=True
    )

    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[IncidentStatus] = mapped_column(
        Enum(
            IncidentStatus,
            name="incident_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=IncidentStatus.OPEN,
        index=True,
        nullable=False,
    )

    mechanic_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("mechanics.id"), index=True, nullable=True
    )
    dispatch_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )

    # Immobilising faults block the vehicle and flag future bookings.
    requires_workshop: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    affected_booking_ids: Mapped[list[str] | None] = mapped_column(
        JSONB, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
