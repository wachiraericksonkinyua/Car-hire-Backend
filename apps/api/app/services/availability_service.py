"""Per-date vehicle availability.

A booking blocks its vehicle for `[pickup_at, block_until)`, where
`block_until = return_at + turnaround buffer`. Only these statuses block:
Reserved, Confirmed, CheckedOut, Overdue.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.booking import Booking, BookingStatus
from app.models.vehicle import Vehicle, VehicleStatus
from app.utils.time import utc_now

BLOCKING_STATUSES = (
    BookingStatus.RESERVED,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_OUT,
    BookingStatus.OVERDUE,
)
RENTED_STATUSES = (
    BookingStatus.CHECKED_OUT,
    BookingStatus.OVERDUE,
)
RESERVED_STATUSES = (
    BookingStatus.RESERVED,
    BookingStatus.CONFIRMED,
)


def effective_block_until(return_at: datetime) -> datetime:
    return return_at + timedelta(
        minutes=get_settings().TURNAROUND_BUFFER_MINUTES
    )


def _overlap_condition(
    pickup_at: datetime,
    block_until: datetime,
    *,
    statuses=BLOCKING_STATUSES,
    exclude_booking_id=None,
):
    conditions = [
        Booking.vehicle_id == Vehicle.id,
        Booking.status.in_(statuses),
        Booking.pickup_at < block_until,
        Booking.block_until > pickup_at,
    ]
    if exclude_booking_id is not None:
        conditions.append(Booking.id != exclude_booking_id)
    return and_(*conditions)


def _exists(*, statuses, pickup_at, block_until):
    return (
        select(Booking.id)
        .where(_overlap_condition(pickup_at, block_until, statuses=statuses))
        .exists()
    )


def status_expressions(
    pickup_at: datetime,
    block_until: datetime,
):
    """Return (is_rented, is_reserved) correlated EXISTS expressions."""
    return (
        _exists(
            statuses=RENTED_STATUSES,
            pickup_at=pickup_at,
            block_until=block_until,
        ),
        _exists(
            statuses=RESERVED_STATUSES,
            pickup_at=pickup_at,
            block_until=block_until,
        ),
    )


def derive_status(
    vehicle: Vehicle,
    *,
    is_rented: bool,
    is_reserved: bool,
) -> str:
    if vehicle.status == VehicleStatus.MAINTENANCE:
        return VehicleStatus.MAINTENANCE.value
    if is_rented:
        return "Rented"
    if is_reserved:
        return "Reserved"
    return VehicleStatus.AVAILABLE.value


def insurance_expired(vehicle: Vehicle, on_date: date) -> bool:
    return vehicle.insurance_expiry < on_date


async def has_booking_conflict(
    db: AsyncSession,
    *,
    vehicle_id,
    pickup_at: datetime,
    block_until: datetime,
    exclude_booking_id=None,
) -> bool:
    conditions = [
        Booking.vehicle_id == vehicle_id,
        Booking.status.in_(BLOCKING_STATUSES),
        Booking.pickup_at < block_until,
        Booking.block_until > pickup_at,
    ]
    if exclude_booking_id is not None:
        conditions.append(Booking.id != exclude_booking_id)

    stmt = select(Booking.id).where(*conditions).limit(1)
    return (await db.execute(stmt)).first() is not None


async def booked_ranges(
    db: AsyncSession,
    vehicle_id,
    *,
    days: int = 30,
) -> list[Booking]:
    now = utc_now()
    horizon = now + timedelta(days=days)
    stmt = (
        select(Booking)
        .where(
            Booking.vehicle_id == vehicle_id,
            Booking.status.in_(BLOCKING_STATUSES),
            Booking.pickup_at < horizon,
            Booking.block_until > now,
        )
        .order_by(Booking.pickup_at)
    )
    return list((await db.execute(stmt)).scalars().all())


def apply_availability_filters(
    stmt: Select,
    *,
    pickup_at: datetime,
    block_until: datetime,
    status: str | None,
    available_only: bool,
) -> Select:
    is_rented, is_reserved = status_expressions(pickup_at, block_until)
    any_overlap = _exists(
        statuses=BLOCKING_STATUSES,
        pickup_at=pickup_at,
        block_until=block_until,
    )

    if status == "Maintenance":
        stmt = stmt.where(Vehicle.status == VehicleStatus.MAINTENANCE)
    elif status == "Rented":
        stmt = stmt.where(
            Vehicle.status == VehicleStatus.AVAILABLE, is_rented
        )
    elif status == "Reserved":
        stmt = stmt.where(
            Vehicle.status == VehicleStatus.AVAILABLE,
            ~is_rented,
            is_reserved,
        )
    elif status == "Available":
        stmt = stmt.where(
            Vehicle.status == VehicleStatus.AVAILABLE,
            ~is_rented,
            ~is_reserved,
        )

    if available_only:
        stmt = stmt.where(
            Vehicle.status == VehicleStatus.AVAILABLE,
            Vehicle.insurance_expiry >= pickup_at.date(),
            ~any_overlap,
        )
    return stmt
