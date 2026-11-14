"""Driver availability and assignment helpers."""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingStatus
from app.models.driver import DriverProfile, DriverStatus
from app.models.user import User

DRIVER_BLOCKING_STATUSES = (
    BookingStatus.RESERVED,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_OUT,
    BookingStatus.OVERDUE,
)


def _assignment_overlap(
    driver_id,
    pickup_at: datetime,
    block_until: datetime,
    exclude_booking_id=None,
):
    conditions = [
        Booking.driver_id == driver_id,
        Booking.status.in_(DRIVER_BLOCKING_STATUSES),
        Booking.pickup_at < block_until,
        Booking.block_until > pickup_at,
    ]
    if exclude_booking_id is not None:
        conditions.append(Booking.id != exclude_booking_id)
    return conditions


async def get_driver_profile(
    db: AsyncSession, user_id
) -> DriverProfile | None:
    return await db.scalar(
        select(DriverProfile).where(DriverProfile.user_id == user_id)
    )


async def driver_has_conflict(
    db: AsyncSession,
    *,
    driver_id,
    pickup_at: datetime,
    block_until: datetime,
    exclude_booking_id=None,
) -> bool:
    stmt = (
        select(Booking.id)
        .where(
            *_assignment_overlap(
                driver_id,
                pickup_at,
                block_until,
                exclude_booking_id,
            )
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


async def available_drivers(
    db: AsyncSession,
    *,
    pickup_at: datetime,
    block_until: datetime,
) -> list[tuple[DriverProfile, User]]:
    from_date = pickup_at.date()
    overlap_exists = (
        select(Booking.id)
        .where(
            Booking.driver_id == DriverProfile.id,
            Booking.status.in_(DRIVER_BLOCKING_STATUSES),
            Booking.pickup_at < block_until,
            Booking.block_until > pickup_at,
        )
        .exists()
    )

    rows = await db.execute(
        select(DriverProfile, User)
        .join(User, DriverProfile.user_id == User.id)
        .where(
            User.is_active.is_(True),
            DriverProfile.status == DriverStatus.AVAILABLE,
            DriverProfile.licence_expiry >= from_date,
            DriverProfile.psv_expiry >= from_date,
            ~overlap_exists,
        )
        .order_by(User.full_name)
    )
    return list(rows.all())


def driver_response(
    profile: DriverProfile, user: User, today: date
) -> dict:
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "full_name": user.full_name,
        "phone": user.phone,
        "licence_class": profile.licence_class,
        "licence_expiry": profile.licence_expiry,
        "psv_expiry": profile.psv_expiry,
        "status": profile.status.value,
        "languages": profile.languages,
        "rating": profile.rating,
        "licence_expired": profile.licence_expiry < today,
        "psv_expired": profile.psv_expiry < today,
    }


async def release_driver_if_idle(
    db: AsyncSession, driver_id
) -> None:
    if driver_id is None:
        return
    other = await db.scalar(
        select(Booking.id)
        .where(
            Booking.driver_id == driver_id,
            Booking.status.in_(DRIVER_BLOCKING_STATUSES),
        )
        .limit(1)
    )
    if other is not None:
        return

    profile = await db.get(DriverProfile, driver_id)
    if profile is not None and profile.status == DriverStatus.ASSIGNED:
        profile.status = DriverStatus.AVAILABLE
