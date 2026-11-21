"""Payment records for M-Pesa transactions."""

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
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PaymentStatus(StrEnum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    FAILED = "Failed"
    MISMATCHED = "Mismatched"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )

    booking_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("bookings.id"), index=True, nullable=False
    )

    # Amount the customer actually paid, and what they should have paid.
    amount_kes: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_due_kes: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_mismatch: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # Money was received but the booking could not be honoured; staff must
    # arrange a manual refund.
    refund_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    # Normalised payer phone (2547XXXXXXXX / 2541XXXXXXXX).
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Safaricom receipt code, e.g. "QK123ABC". NULL until confirmed.
    mpesa_receipt: Mapped[str | None] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )

    checkout_request_id: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(
            PaymentStatus,
            name="payment_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=PaymentStatus.PENDING,
        nullable=False,
    )

    # Original Safaricom callback, kept for reconciliation and audits.
    raw_callback: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
