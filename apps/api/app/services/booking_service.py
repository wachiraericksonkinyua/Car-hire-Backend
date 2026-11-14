"""Booking business logic: reference, pricing, and the hold window."""

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.booking import Booking, BookingStatus
from app.models.booking_counter import BookingCounter
from app.models.vehicle import Vehicle, VehicleStatus
from app.schemas.booking import BookingCreate
from app.services.availability_service import (
    effective_block_until,
    has_booking_conflict,
    insurance_expired,
)
from app.services.pricing_service import (
    InvalidRentalPeriodError,
    calculate_quote,
)
from app.utils.time import utc_now


class InvalidBookingDatesError(Exception):
    """Raised when the return time is not after the pickup time."""


class VehicleNotFoundError(Exception):
    """Raised when the requested vehicle does not exist."""


class VehicleUnavailableError(Exception):
    """Raised when the vehicle is not currently available."""


async def _next_reference(db: AsyncSession, when) -> str:
    """Allocate the next BK-YYMM-#### reference atomically."""
    period = when.strftime("%y%m")
    stmt = (
        pg_insert(BookingCounter)
        .values(period=period, last_value=1)
        .on_conflict_do_update(
            index_elements=[BookingCounter.period],
            set_={"last_value": BookingCounter.last_value + 1},
        )
        .returning(BookingCounter.last_value)
    )
    value = (await db.execute(stmt)).scalar_one()
    return f"BK-{period}-{value:04d}"


async def create_booking(
    db: AsyncSession,
    created_by_id: UUID,
    data: BookingCreate,
) -> Booking:
    """Create an atomic reservation and return it.

    The vehicle row is locked with `SELECT ... FOR UPDATE`. The exclusion
    constraint added in the migration step provides the final guarantee
    against overlapping blocking bookings.
    """
    settings = get_settings()

    # The request-level transaction is owned by `get_db`. Lock the vehicle
    # row so concurrent requests for the same car serialise here.
    stmt = (
        select(Vehicle)
        .where(Vehicle.id == data.vehicle_id)
        .with_for_update()
    )
    vehicle = (await db.execute(stmt)).scalar_one_or_none()

    if vehicle is None:
        raise VehicleNotFoundError("Vehicle not found")

    if vehicle.status != VehicleStatus.AVAILABLE:
        raise VehicleUnavailableError(
            f"Vehicle is {vehicle.status.value}, not available"
        )

    if insurance_expired(vehicle, data.pickup_at.date()):
        raise VehicleUnavailableError(
            "Vehicle insurance has expired and it cannot be booked"
        )

    block_until = effective_block_until(data.return_at)
    if await has_booking_conflict(
        db,
        vehicle_id=vehicle.id,
        pickup_at=data.pickup_at,
        block_until=block_until,
    ):
        raise VehicleUnavailableError(
            "Vehicle is already booked for those dates"
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
        raise InvalidBookingDatesError(str(exc)) from exc

    booking = Booking(
        reference=await _next_reference(db, data.pickup_at),
        vehicle_id=vehicle.id,
        created_by_id=created_by_id,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_email=data.customer_email,
        customer_id_type=data.customer_id_type,
        customer_id_number=data.customer_id_number,
        pickup_location=data.pickup_location,
        pickup_at=data.pickup_at,
        return_at=data.return_at,
        block_until=block_until,
        total_kes=quote.total_due_kes,
        status=BookingStatus.RESERVED,
        hold_expires_at=(
            utc_now() + timedelta(minutes=settings.HOLD_MINUTES)
        ),
        with_chauffeur=data.with_chauffeur,
        pricing_snapshot=quote.model_dump(mode="json"),
    )
    db.add(booking)

    # Flush so database-side values such as `created_at` are available; the
    # request transaction commits after the response is built.
    await db.flush()
    await db.refresh(booking)
    return booking
