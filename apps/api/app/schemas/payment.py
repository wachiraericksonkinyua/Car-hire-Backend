"""Pydantic schemas for M-Pesa STK Push requests and callbacks."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.utils.phone import normalize_kenyan_phone


class MpesaStkRequest(BaseModel):
    """Body the frontend sends to start an M-Pesa payment.

    Any `amount` sent by the client is deliberately ignored; the server
    always charges the booking's own total.
    """

    phone_number: str
    booking_id: UUID

    @field_validator("phone_number")
    @classmethod
    def _normalise_phone(cls, value: str) -> str:
        # Accepts 07XX/01XX and stores/sends 2547XX/2541XX.
        return normalize_kenyan_phone(value)


class MpesaCallbackItem(BaseModel):
    """One entry in Safaricom's `CallbackMetadata.Item` list."""

    Name: str
    Value: str | int | float | None = None


class MpesaCallbackMetadata(BaseModel):
    Item: list[MpesaCallbackItem] = []


class MpesaStkCallback(BaseModel):
    """The inner `stkCallback` object Safaricom posts to our webhook."""

    MerchantRequestID: str | None = None
    CheckoutRequestID: str
    ResultCode: int
    ResultDesc: str | None = None
    CallbackMetadata: MpesaCallbackMetadata | None = None


class MpesaCallbackBody(BaseModel):
    stkCallback: MpesaStkCallback


class MpesaCallbackPayload(BaseModel):
    """The full JSON body Safaricom sends to our callback URL."""

    Body: MpesaCallbackBody


class PaymentStatusResponse(BaseModel):
    """Safe payment view for polling and booking detail screens."""

    payment_id: UUID
    booking_id: UUID
    checkout_request_id: str
    status: str
    booking_status: str | None = None
    amount_due_kes: int
    amount_paid_kes: int
    amount_mismatch: bool
    refund_required: bool
    mpesa_receipt: str | None
    phone_masked: str | None
    created_at: datetime
