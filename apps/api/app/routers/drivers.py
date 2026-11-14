"""Driver roster, availability and driver trip endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.booking import Booking, BookingStatus, TripStatus
from app.models.driver import DriverProfile
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.common import SuccessEnvelope
from app.schemas.driver import (
    DriverResponse,
    DriverTripResponse,
    TripStatusUpdate,
)
from app.services.audit_service import record_audit
from app.services.driver_service import (
    available_drivers,
    driver_response,
    get_driver_profile,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/drivers", tags=["drivers"])

_TRIP_VISIBLE_STATUSES = (
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_OUT,
    BookingStatus.OVERDUE,
)

_ALLOWED_TRANSITIONS = {
    (None, "EnRoute"),
    (TripStatus.ASSIGNED, "EnRoute"),
    (TripStatus.EN_ROUTE, "CustomerOnboard"),
    (TripStatus.CUSTOMER_ONBOARD, "Completed"),
}


def _trip(booking: Booking, vehicle: Vehicle) -> DriverTripResponse:
    return DriverTripResponse(
        booking_id=booking.id,
        reference=booking.reference,
        status=booking.status.value,
        trip_status=booking.trip_status.value if booking.trip_status else None,
        customer_name=booking.customer_name,
        customer_phone=booking.customer_phone,
        pickup_at=booking.pickup_at,
        return_at=booking.return_at,
        pickup_location=booking.pickup_location,
        vehicle_plate=vehicle.plate_number,
        vehicle_model=f"{vehicle.brand} {vehicle.model}",
    )


@router.get("", response_model=SuccessEnvelope[list[DriverResponse]])
async def list_drivers(
    _payload: dict = Depends(require_permission(Permission.DRIVER_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(DriverProfile, User)
            .join(User, DriverProfile.user_id == User.id)
            .order_by(User.full_name)
        )
    ).all()
    today = utc_now().date()
    return {
        "data": [
            driver_response(profile, user, today)
            for profile, user in rows
        ]
    }


@router.get(
    "/available", response_model=SuccessEnvelope[list[DriverResponse]]
)
async def list_available_drivers(
    date_from: datetime = Query(alias="from"),
    date_to: datetime = Query(alias="to"),
    vehicle_id: UUID | None = Query(default=None),
    _payload: dict = Depends(require_permission(Permission.DRIVER_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    if date_from >= date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'from' must be before 'to'",
        )

    if vehicle_id is not None:
        vehicle = await db.get(Vehicle, vehicle_id)
        if vehicle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found",
            )

    drivers = await available_drivers(
        db, pickup_at=date_from, block_until=date_to
    )
    today = utc_now().date()
    return {
        "data": [
            driver_response(profile, user, today)
            for profile, user in drivers
        ]
    }


@router.get(
    "/my-trips", response_model=SuccessEnvelope[list[DriverTripResponse]]
)
async def my_trips(
    payload: dict = Depends(require_permission(Permission.TRIP_VIEW_OWN)),
    db: AsyncSession = Depends(get_db),
):
    profile = await get_driver_profile(db, payload["sub"])
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No driver profile is linked to this account",
        )

    rows = (
        await db.execute(
            select(Booking, Vehicle)
            .join(Vehicle, Booking.vehicle_id == Vehicle.id)
            .where(
                Booking.driver_id == profile.id,
                Booking.status.in_(_TRIP_VISIBLE_STATUSES),
            )
            .order_by(Booking.pickup_at)
        )
    ).all()
    return {"data": [_trip(booking, vehicle) for booking, vehicle in rows]}


@router.patch(
    "/my-trips/{booking_id}",
    response_model=SuccessEnvelope[DriverTripResponse],
)
async def update_trip_status(
    booking_id: UUID,
    data: TripStatusUpdate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.TRIP_VIEW_OWN)),
    db: AsyncSession = Depends(get_db),
):
    profile = await get_driver_profile(db, payload["sub"])
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No driver profile is linked to this account",
        )

    booking = await db.get(Booking, booking_id)
    if booking is None or booking.driver_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    if (booking.trip_status, data.status) not in _ALLOWED_TRANSITIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invalid trip status transition",
        )

    booking.trip_status = TripStatus(data.status)
    await record_audit(
        db,
        actor_id=profile.user_id,
        action="trip.status",
        entity="booking",
        entity_id=str(booking.id),
        after={"trip_status": booking.trip_status.value},
        request_id=getattr(request.state, "request_id", None),
    )

    vehicle = await db.get(Vehicle, booking.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    await db.flush()
    await db.refresh(booking)
    return {"data": _trip(booking, vehicle)}
