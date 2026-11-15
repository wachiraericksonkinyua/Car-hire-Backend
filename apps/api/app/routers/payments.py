"""M-Pesa payment endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.booking import Booking
from app.models.payment import Payment
from app.schemas.common import SuccessEnvelope
from app.schemas.payment import (
    MpesaCallbackPayload,
    MpesaStkRequest,
    PaymentStatusResponse,
)
from app.services.payment_service import (
    BookingNotFoundError,
    BookingNotPayableError,
    DuplicatePaymentError,
    DuplicateReceiptError,
    HoldExpiredError,
    MpesaRequestError,
    PaymentNotFoundError,
    handle_mpesa_callback,
    initiate_stk_push,
)
from app.utils.phone import mask_phone

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/stk-push")
async def stk_push(
    data: MpesaStkRequest,
    _payload: dict = Depends(require_permission(Permission.PAYMENT_INITIATE)),
    db: AsyncSession = Depends(get_db),
):
    """Ask Safaricom to prompt the customer's phone for payment."""
    try:
        payment = await initiate_stk_push(
            db,
            booking_id=data.booking_id,
            phone=data.phone_number,
        )
    except BookingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    except (BookingNotPayableError, HoldExpiredError, DuplicatePaymentError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    except MpesaRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        )

    return {
        "data": {
            "payment_id": payment.id,
            "checkout_request_id": payment.checkout_request_id,
            "status": payment.status.value,
        }
    }


@router.get(
    "/{checkout_request_id}",
    response_model=SuccessEnvelope[PaymentStatusResponse],
)
async def get_payment_status(
    checkout_request_id: str,
    _payload: dict = Depends(require_permission(Permission.PAYMENT_INITIATE)),
    db: AsyncSession = Depends(get_db),
):
    """Poll the locally recorded status of an M-Pesa payment."""
    payment = await db.scalar(
        select(Payment).where(
            Payment.checkout_request_id == checkout_request_id
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    booking = await db.get(Booking, payment.booking_id)
    return {
        "data": PaymentStatusResponse(
            payment_id=payment.id,
            booking_id=payment.booking_id,
            checkout_request_id=payment.checkout_request_id,
            status=payment.status.value,
            booking_status=booking.status.value if booking else None,
            amount_due_kes=payment.amount_due_kes,
            amount_paid_kes=payment.amount_kes,
            amount_mismatch=payment.amount_mismatch,
            refund_required=payment.refund_required,
            mpesa_receipt=payment.mpesa_receipt,
            phone_masked=mask_phone(payment.phone),
            created_at=payment.created_at,
        )
    }


@router.post("/mpesa/callback")
async def mpesa_callback(
    payload: MpesaCallbackPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public webhook Safaricom calls when a payment finishes."""
    try:
        payment = await handle_mpesa_callback(
            db,
            payload.model_dump(),
            request_id=getattr(request.state, "request_id", None),
        )
    except PaymentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    except DuplicateReceiptError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    except MpesaRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )

    booking = await db.get(Booking, payment.booking_id)
    # Returning 200 tells Safaricom we processed the callback.
    return {
        "data": {
            "ResultCode": 0,
            "ResultDesc": "Callback processed",
            "status": payment.status.value,
            "booking_status": booking.status.value if booking else None,
            "mpesa_receipt": payment.mpesa_receipt,
            "amount_mismatch": payment.amount_mismatch,
            "refund_required": payment.refund_required,
        }
    }
