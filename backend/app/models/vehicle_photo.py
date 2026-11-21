"""Vehicle photos stored as database blobs and served by the API."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VehiclePhoto(Base):
    __tablename__ = "vehicle_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vehicles.id"), index=True, nullable=False
    )

    url: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Image bytes live in PostgreSQL so backups and deletes are atomic.
    data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    content_type: Mapped[str | None] = mapped_column(
        String(60), nullable=True
    )
    filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    vehicle = relationship("Vehicle", back_populates="photos")
