"""Atomic monthly counter for booking references (BK-YYMM-####)."""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BookingCounter(Base):
    __tablename__ = "booking_counters"

    # YYMM, e.g. "2612".
    period: Mapped[str] = mapped_column(String(4), primary_key=True)
    last_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
