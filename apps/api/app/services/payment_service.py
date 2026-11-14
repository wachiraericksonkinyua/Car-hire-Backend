"""M-Pesa payment logic: STK Push initiation and callback fulfilment."""

import base64
from datetime import datetime
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.services.audit_service import record_audit, snapshot
from app.services.availability_service import has_booking_conflict
from app.utils.time import as_utc, utc_now


class PaymentError(Exception):
    """Base class for payment-related failures."""


class BookingNotFoundError(PaymentError):
    """The booking being paid for does not exist."""


class PaymentNotFoundError(PaymentError):
    """No payment matches the callback's CheckoutRequestID."""


class BookingNotPayableError(PaymentError):
    """The booking is not in a state that can be paid online."""


class HoldExpiredError(PaymentError):
    """The reservation hold has already expired."""


class DuplicatePaymentError(PaymentError):
    """A completed payment already exists for this booking."""


class DuplicateReceiptError(PaymentError):
    """This M-Pesa receipt has already been used on another payment."""


class MpesaRequestError(PaymentError):
    """Safaricom rejected the request or returned an unexpected response."""


def _require_mpesa_config() -> None:
    """Fail with a clear message when Daraja credentials are missing."""
    settings = get_settings()
    missing = [
        name
        for name, value in {
            "MPESA_CONSUMER_KEY": settings.MPESA_CONSUMER_KEY,
            "MPESA_CONSUMER_SECRET": settings.MPESA_CONSUMER_SECRET,
            "MPESA_PASSKEY": settings.MPESA_PASSKEY,
            "MPESA_CALLBACK_URL": settings.MPESA_CALLBACK_URL,
        }.items()
        if not value
    ]
    if missing:
        raise MpesaRequestError(
            "Missing M-Pesa settings: " + ", ".join(missing)
        )


async def _get_access_token() -> str:
    """Ask Safaricom for an OAuth bearer token (client credentials)."""
    settings = get_settings()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.MPESA_BASE_URL}/oauth/v1/generate",
            params={"grant_type": "client_credentials"},
            auth=(
                settings.MPESA_CONSUMER_KEY,
                settings.MPESA_CONSUMER_SECRET,
            ),
        )
        response.raise_for_status()
        return response.json()["access_token"]


async def _send_stk_push(
    phone: str,
    amount: int,
    booking_id: UUID,
) -> dict:
    """POST the STK Push request to Safaricom.

    Kept as a separate function so tests can monkeypatch it and avoid
    making real network calls.
    """
    _require_mpesa_config()
    settings = get_settings()

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(
        f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}".encode()
    ).decode()

    token = await _get_access_token()
    body = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": settings.MPESA_TRANSACTION_TYPE,
        "Amount": amount,
        "PartyA": phone,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": settings.MPESA_CALLBACK_URL,
        "AccountReference": str(booking_id),
        "TransactionDesc": "Car hire booking payment",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{settings.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        response.raise_for_status()
        return response.json()


async def initiate_stk_push(
    db: AsyncSession,
    booking_id: UUID,
    phone: str,
) -> Payment:
    """Start an STK Push for the booking's server-computed total."""
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise BookingNotFoundError("Booking not found")

    if booking.status != BookingStatus.RESERVED:
        raise BookingNotPayableError(
            "Only Reserved bookings can be paid online"
        )

    if as_utc(booking.hold_expires_at) <= utc_now():
        raise HoldExpiredError(
            "The reservation hold has expired; recheck availability"
        )

    completed = await db.scalar(
        select(Payment.id).where(
            Payment.booking_id == booking.id,
            Payment.status == PaymentStatus.COMPLETED,
        )
    )
    if completed is not None:
        raise DuplicatePaymentError("This booking is already paid")

    amount_due = booking.total_kes

    try:
        result = await _send_stk_push(phone, amount_due, booking_id)
    except httpx.HTTPError as exc:
        raise MpesaRequestError(f"Safaricom request failed: {exc}") from exc

    checkout_id = result.get("CheckoutRequestID")
    if not checkout_id:
        raise MpesaRequestError("Safaricom response had no CheckoutRequestID")

    payment = Payment(
        booking_id=booking.id,
        # Expected amount at initiation; the callback replaces this with the
        # amount actually paid.
        amount_kes=amount_due,
        amount_due_kes=amount_due,
        phone=phone,
        checkout_request_id=checkout_id,
        status=PaymentStatus.PENDING,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)
    return payment


_PAYMENT_AUDIT_FIELDS = [
    "status",
    "amount_kes",
    "amount_due_kes",
    "amount_mismatch",
    "mpesa_receipt",
    "refund_required",
]


async def _record_payment_event(
    db: AsyncSession,
    payment: Payment,
    *,
    action: str,
    before: dict,
    request_id: str | None,
) -> None:
    await record_audit(
        db,
        actor_id=None,
        action=action,
        entity="payment",
        entity_id=str(payment.id),
        before=before,
        after=snapshot(payment, _PAYMENT_AUDIT_FIELDS),
        request_id=request_id,
    )


async def _fulfil_booking(
    db: AsyncSession,
    payment: Payment,
    booking: Booking,
) -> str:
    """Decide whether a paid booking can be confirmed. Returns the action."""
    if booking.status in {BookingStatus.CANCELLED, BookingStatus.COMPLETED}:
        payment.refund_required = True
        return "payment.refund-required"

    if booking.status == BookingStatus.CONFIRMED:
        return "payment.completed"

    if booking.status in {
        BookingStatus.CHECKED_OUT,
        BookingStatus.OVERDUE,
    }:
        return "payment.completed"

    hold_expired = (
        booking.status == BookingStatus.EXPIRED
        or as_utc(booking.hold_expires_at) <= utc_now()
    )

    if not hold_expired and booking.status == BookingStatus.RESERVED:
        booking.status = BookingStatus.CONFIRMED
        return "booking.confirm"

    # Late payment after hold expiry: only confirm if the car is still free.
    conflict = await has_booking_conflict(
        db,
        vehicle_id=booking.vehicle_id,
        pickup_at=booking.pickup_at,
        block_until=booking.block_until,
        exclude_booking_id=booking.id,
    )
    if not conflict and booking.status in {
        BookingStatus.RESERVED,
        BookingStatus.EXPIRED,
    }:
        booking.status = BookingStatus.CONFIRMED
        return "booking.late-confirm"

    payment.refund_required = True
    return "payment.refund-required"


async def handle_mpesa_callback(
    db: AsyncSession,
    payload: dict,
    *,
    request_id: str | None = None,
) -> Payment:
    """Process Safaricom's webhook idempotently and fulfil the booking."""
    callback = payload.get("Body", {}).get("stkCallback", {})
    checkout_id = callback.get("CheckoutRequestID")
    if not checkout_id:
        raise MpesaRequestError("Missing CheckoutRequestID")

    payment = await db.scalar(
        select(Payment)
        .where(Payment.checkout_request_id == checkout_id)
        .with_for_update()
    )
    if payment is None:
        raise PaymentNotFoundError("Unknown CheckoutRequestID")

    items = (callback.get("CallbackMetadata") or {}).get("Item") or []
    metadata = {
        item.get("Name"): item.get("Value")
        for item in items
        if isinstance(item, dict)
    }
    receipt_value = metadata.get("MpesaReceiptNumber")
    receipt = str(receipt_value) if receipt_value else None
    paid_value = metadata.get("Amount")
    paid = int(paid_value) if paid_value is not None else None

    # Idempotency: repeated callbacks for an already-completed payment are
    # accepted without changing the booking or writing another audit entry.
    if payment.status == PaymentStatus.COMPLETED:
        if receipt is None or payment.mpesa_receipt == receipt:
            return payment
        raise DuplicateReceiptError(
            "A different receipt was already recorded for this checkout"
        )

    before = snapshot(payment, _PAYMENT_AUDIT_FIELDS)
    payment.raw_callback = payload

    # ResultCode 0 means the customer paid; anything else is a failure.
    if int(callback.get("ResultCode", -1)) != 0:
        payment.status = PaymentStatus.FAILED
        await _record_payment_event(
            db,
            payment,
            action="payment.failed",
            before=before,
            request_id=request_id,
        )
        await db.flush()
        await db.refresh(payment)
        return payment

    if receipt is not None:
        duplicate = await db.scalar(
            select(Payment.id).where(
                Payment.mpesa_receipt == receipt,
                Payment.id != payment.id,
            )
        )
        if duplicate is not None:
            raise DuplicateReceiptError(
                "This M-Pesa receipt is already used by another payment"
            )

    if paid is None:
        payment.amount_mismatch = True
        payment.status = PaymentStatus.MISMATCHED
        if receipt is not None:
            payment.mpesa_receipt = receipt
        await _record_payment_event(
            db,
            payment,
            action="payment.mismatch",
            before=before,
            request_id=request_id,
        )
        await db.flush()
        await db.refresh(payment)
        return payment

    payment.amount_kes = paid
    if receipt is not None:
        payment.mpesa_receipt = receipt

    # Never confirm a booking when the amount is wrong.
    if paid != payment.amount_due_kes:
        payment.amount_mismatch = True
        payment.status = PaymentStatus.MISMATCHED
        await _record_payment_event(
            db,
            payment,
            action="payment.mismatch",
            before=before,
            request_id=request_id,
        )
        await db.flush()
        await db.refresh(payment)
        return payment

    payment.amount_mismatch = False
    payment.status = PaymentStatus.COMPLETED
    payment.refund_required = False

    booking = await db.get(Booking, payment.booking_id)
    if booking is None:
        raise PaymentNotFoundError("Booking for this payment no longer exists")

    action = await _fulfil_booking(db, payment, booking)
    await _record_payment_event(
        db,
        payment,
        action=action,
        before=before,
        request_id=request_id,
    )

    await db.flush()
    await db.refresh(payment)
    return payment
