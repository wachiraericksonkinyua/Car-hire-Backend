"""Public customer-facing endpoints.

These routes do not require staff authentication. They expose only the
information a customer needs for a guest booking and never return internal
IDs such as the creator or customer ID number.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.vehicle_photo import VehiclePhoto
from app.schemas.booking import (
    BookingCreate,
    PublicBookingResponse,
    PublicBookingStatus,
    PublicPaymentStatus,
)
from app.schemas.common import SuccessEnvelope
from app.schemas.mechanic import MechanicResponse
from app.schemas.quote import QuoteRequest, QuoteResponse
from app.schemas.vehicle import (
    BookedRange,
    VehicleDetailResponse,
    VehicleListData,
    VehicleResponse,
)
from app.services.audit_service import record_audit
from app.services.availability_service import (
    apply_availability_filters,
    booked_ranges,
    derive_status,
    effective_block_until,
    insurance_expired,
    status_expressions,
)
from app.services.booking_service import (
    InvalidBookingDatesError,
    VehicleNotFoundError,
    VehicleUnavailableError,
    create_booking,
)
from app.services.mechanic_service import find_nearest_mechanics
from app.services.payment_service import (
    BookingNotFoundError,
    BookingNotPayableError,
    DuplicatePaymentError,
    HoldExpiredError,
    MpesaRequestError,
    initiate_stk_push,
)
from app.services.pricing_service import (
    InvalidRentalPeriodError,
    calculate_quote,
)
from app.utils.phone import mask_phone, normalize_kenyan_phone
from app.utils.time import utc_now

router = APIRouter(prefix="/public", tags=["public"])


def _photo_list_options():
    """Load photo metadata only, never the image bytes, for list responses."""
    return selectinload(Vehicle.photos).load_only(
        VehiclePhoto.id,
        VehiclePhoto.url,
        VehiclePhoto.caption,
        VehiclePhoto.sort_order,
        VehiclePhoto.created_at,
    )


class PublicStkRequest(BaseModel):
    reference: str
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_kenyan_phone(value)


def _window(
    date_from: datetime | None, date_to: datetime | None
) -> tuple[datetime, datetime]:
    if (date_from is None) != (date_to is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide both 'from' and 'to', or neither",
        )
    if date_from is None:
        now = utc_now()
        return now, now
    if date_from >= date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'from' must be before 'to'",
        )
    return date_from, date_to


def _vehicle_response(vehicle: Vehicle, derived: str) -> VehicleResponse:
    return VehicleResponse(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        brand=vehicle.brand,
        model=vehicle.model,
        year=vehicle.year,
        category=vehicle.category,
        transmission=vehicle.transmission,
        fuel=vehicle.fuel,
        seats=vehicle.seats,
        bags=vehicle.bags,
        daily_rate_kes=vehicle.daily_rate_kes,
        deposit_kes=vehicle.deposit_kes,
        mileage_cap_km=vehicle.mileage_cap_km,
        insurance_expiry=vehicle.insurance_expiry,
        specs=vehicle.specs,
        status=derived,
        insurance_expired=insurance_expired(vehicle, utc_now().date()),
        created_at=vehicle.created_at,
        photos=sorted(
            vehicle.__dict__.get("photos", []),
            key=lambda photo: photo.sort_order,
        ),
    )


@router.get(
    "/vehicles", response_model=SuccessEnvelope[VehicleListData]
)
async def public_vehicles(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    category: str | None = Query(default=None),
    transmission: str | None = Query(default=None),
    fuel: str | None = Query(default=None),
    seats: int | None = Query(default=None, ge=1),
    brand: str | None = Query(default=None),
    vehicle_status: str | None = Query(default=None, alias="status"),
    plate: str | None = Query(default=None),
    available_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    pickup_at, return_at = _window(date_from, date_to)
    block_until = effective_block_until(return_at)

    conditions = []
    if category is not None:
        conditions.append(Vehicle.category.ilike(category))
    if transmission is not None:
        conditions.append(Vehicle.transmission.ilike(transmission))
    if fuel is not None:
        conditions.append(Vehicle.fuel.ilike(fuel))
    if seats is not None:
        conditions.append(Vehicle.seats == seats)
    if brand is not None:
        conditions.append(Vehicle.brand.ilike(f"%{brand}%"))
    if plate is not None:
        conditions.append(Vehicle.plate_number.ilike(f"%{plate}%"))
    if vehicle_status is not None and vehicle_status not in {
        "Available",
        "Reserved",
        "Rented",
        "Maintenance",
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown vehicle status",
        )

    total = await db.scalar(
        apply_availability_filters(
            select(func.count()).select_from(Vehicle).where(*conditions),
            pickup_at=pickup_at,
            block_until=block_until,
            status=vehicle_status,
            available_only=available_only,
        )
    )

    is_rented, is_reserved = status_expressions(pickup_at, block_until)
    stmt = apply_availability_filters(
        select(
            Vehicle,
            is_rented.label("is_rented"),
            is_reserved.label("is_reserved"),
        )
        .options(_photo_list_options())
        .where(*conditions)
        .order_by(Vehicle.created_at.desc())
        .limit(limit)
        .offset(offset),
        pickup_at=pickup_at,
        block_until=block_until,
        status=vehicle_status,
        available_only=available_only,
    )

    rows = (await db.execute(stmt)).all()
    return {
        "data": VehicleListData(
            items=[
                _vehicle_response(
                    vehicle,
                    derive_status(
                        vehicle,
                        is_rented=bool(rented),
                        is_reserved=bool(reserved),
                    ),
                )
                for vehicle, rented, reserved in rows
            ],
            total=total or 0,
            limit=limit,
            offset=offset,
        )
    }


@router.get(
    "/vehicles/{vehicle_id}",
    response_model=SuccessEnvelope[VehicleDetailResponse],
)
async def public_vehicle(
    vehicle_id: UUID,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    pickup_at, return_at = _window(date_from, date_to)
    block_until = effective_block_until(return_at)

    is_rented, is_reserved = status_expressions(pickup_at, block_until)
    row = (
        await db.execute(
            select(Vehicle, is_rented, is_reserved)
            .options(_photo_list_options())
            .where(Vehicle.id == vehicle_id)
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    vehicle, rented, reserved = row
    base = _vehicle_response(
        vehicle,
        derive_status(
            vehicle, is_rented=bool(rented), is_reserved=bool(reserved)
        ),
    )
    ranges = await booked_ranges(db, vehicle_id, days=30)
    return {
        "data": VehicleDetailResponse(
            **base.model_dump(),
            booked_ranges=[
                BookedRange(
                    booking_id=booking.id,
                    reference=booking.reference,
                    pickup_at=booking.pickup_at,
                    return_at=booking.return_at,
                    block_until=booking.block_until,
                    status=booking.status.value,
                )
                for booking in ranges
            ],
        )
    }


@router.get("/vehicles/{vehicle_id}/photos/{photo_id}")
async def public_vehicle_photo(
    vehicle_id: UUID,
    photo_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(VehiclePhoto, photo_id)
    if (
        photo is None
        or photo.vehicle_id != vehicle_id
        or photo.data is None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle image not found",
        )
    return Response(
        content=photo.data,
        media_type=photo.content_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post(
    "/quotes/calculate", response_model=SuccessEnvelope[QuoteResponse]
)
async def public_quote(
    data: QuoteRequest,
    db: AsyncSession = Depends(get_db),
):
    vehicle = await db.get(Vehicle, data.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    try:
        quote = calculate_quote(
            vehicle,
            pickup_at=data.pickup_at,
            return_at=data.return_at,
            with_chauffeur=data.with_chauffeur,
            chauffeur_zone=data.chauffeur_zone,
            extras=data.extras,
        )
    except InvalidRentalPeriodError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    return {"data": quote}


@router.post(
    "/bookings", response_model=SuccessEnvelope[PublicBookingResponse]
)
async def public_create_booking(
    data: BookingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        booking = await create_booking(
            db, created_by_id=None, data=data
        )
    except VehicleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    except VehicleUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    except InvalidBookingDatesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    await record_audit(
        db,
        actor_id=None,
        action="booking.create-public",
        entity="booking",
        entity_id=str(booking.id),
        after={
            "reference": booking.reference,
            "vehicle_id": str(booking.vehicle_id),
            "total_kes": booking.total_kes,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    return {
        "data": PublicBookingResponse(
            reference=booking.reference,
            status=booking.status.value,
            vehicle_id=booking.vehicle_id,
            pickup_at=booking.pickup_at,
            return_at=booking.return_at,
            hold_expires_at=booking.hold_expires_at,
            total_kes=booking.total_kes,
            pricing_snapshot=booking.pricing_snapshot,
        )
    }


async def _find_customer_booking(
    db: AsyncSession, reference: str, phone: str
) -> Booking:
    try:
        normalized = normalize_kenyan_phone(phone)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    booking = await db.scalar(
        select(Booking).where(
            Booking.reference == reference,
            Booking.customer_phone == normalized,
        )
    )
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    return booking


@router.get(
    "/bookings/{reference}",
    response_model=SuccessEnvelope[PublicBookingStatus],
)
async def public_booking_status(
    reference: str,
    phone: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    booking = await _find_customer_booking(db, reference, phone)
    payment = await db.scalar(
        select(Payment)
        .where(Payment.booking_id == booking.id)
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    return {
        "data": PublicBookingStatus(
            reference=booking.reference,
            status=booking.status.value,
            vehicle_id=booking.vehicle_id,
            pickup_at=booking.pickup_at,
            return_at=booking.return_at,
            hold_expires_at=booking.hold_expires_at,
            total_kes=booking.total_kes,
            pricing_snapshot=booking.pricing_snapshot,
            payment_status=payment.status.value if payment else None,
            mpesa_receipt=payment.mpesa_receipt if payment else None,
            refund_required=payment.refund_required if payment else None,
        )
    }


@router.post("/payments/stk-push")
async def public_stk_push(
    data: PublicStkRequest,
    db: AsyncSession = Depends(get_db),
):
    booking = await _find_customer_booking(
        db, data.reference, data.phone_number
    )
    try:
        payment = await initiate_stk_push(
            db, booking_id=booking.id, phone=data.phone_number
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
            "checkout_request_id": payment.checkout_request_id,
            "status": payment.status.value,
        }
    }


@router.get(
    "/payments/{checkout_request_id}",
    response_model=SuccessEnvelope[PublicPaymentStatus],
)
async def public_payment_status(
    checkout_request_id: str,
    reference: str = Query(...),
    phone: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    booking = await _find_customer_booking(db, reference, phone)
    payment = await db.scalar(
        select(Payment).where(
            Payment.checkout_request_id == checkout_request_id,
            Payment.booking_id == booking.id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )
    return {
        "data": PublicPaymentStatus(
            checkout_request_id=payment.checkout_request_id,
            status=payment.status.value,
            booking_status=booking.status.value,
            amount_due_kes=payment.amount_due_kes,
            amount_paid_kes=payment.amount_kes,
            amount_mismatch=payment.amount_mismatch,
            refund_required=payment.refund_required,
            mpesa_receipt=payment.mpesa_receipt,
            phone_masked=mask_phone(payment.phone),
        )
    }


@router.get(
    "/mechanics/nearest",
    response_model=SuccessEnvelope[list[MechanicResponse]],
)
async def public_nearest_mechanics(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    limit: int = Query(default=5, ge=1, le=50),
    max_distance_km: float = Query(default=50, gt=0, le=200),
    db: AsyncSession = Depends(get_db),
):
    ranked = await find_nearest_mechanics(
        db,
        lat=lat,
        lng=lng,
        limit=limit,
        max_distance_km=max_distance_km,
    )
    return {
        "data": [
            MechanicResponse(
                id=mechanic.id,
                name=mechanic.name,
                garage=mechanic.garage,
                phone=mechanic.phone,
                whatsapp=mechanic.whatsapp,
                county=mechanic.county,
                town=mechanic.town,
                mechanic_type=mechanic.mechanic_type,
                specialties=mechanic.specialties,
                call_out_rate_kes=mechanic.call_out_rate_kes,
                location={"type": "Point", "coordinates": [
                    mechanic.longitude, mechanic.latitude
                ]},
                is_available=mechanic.is_available,
                distance_km=round(distance, 2),
                created_at=mechanic.created_at,
            )
            for mechanic, distance in ranked
        ]
    }
