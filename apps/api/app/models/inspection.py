"""Vehicle handover inspections at check-out and check-in."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InspectionKind(StrEnum):
    CHECK_OUT = "CheckOut"
    CHECK_IN = "CheckIn"


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    booking_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("bookings.id"), index=True, nullable=False
    )

    kind: Mapped[InspectionKind] = mapped_column(
        Enum(
            InspectionKind,
            name="inspection_kind",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        index=True,
        nullable=False,
    )

    fuel_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    odometer_km: Mapped[int] = mapped_column(Integer, nullable=False)

    photos: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmation: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    critical_defect: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    late_fee_kes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    excess_mileage_kes: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    settlement_snapshot: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
