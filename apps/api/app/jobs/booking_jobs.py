"""Background booking lifecycle jobs."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.booking import Booking, BookingStatus
from app.services.audit_service import record_audit
from app.utils.time import utc_now


async def _expire_holds(db: AsyncSession) -> int:
    now = utc_now()
    result = await db.execute(
        select(Booking)
        .where(
            Booking.status == BookingStatus.RESERVED,
            Booking.hold_expires_at <= now,
        )
        .with_for_update(skip_locked=True)
    )
    bookings = result.scalars().all()

    for booking in bookings:
        before = {"status": booking.status.value}
        booking.status = BookingStatus.EXPIRED
        await record_audit(
            db,
            actor_id=None,
            action="booking.expire",
            entity="booking",
            entity_id=str(booking.id),
            before=before,
            after={"status": BookingStatus.EXPIRED.value},
        )
    return len(bookings)


async def _flag_overdue(db: AsyncSession) -> int:
    settings = get_settings()
    threshold = utc_now() - timedelta(
        minutes=settings.LATE_FEE_GRACE_MINUTES
    )
    result = await db.execute(
        select(Booking)
        .where(
            Booking.status == BookingStatus.CHECKED_OUT,
            Booking.return_at <= threshold,
        )
        .with_for_update(skip_locked=True)
    )
    bookings = result.scalars().all()

    for booking in bookings:
        before = {"status": booking.status.value}
        booking.status = BookingStatus.OVERDUE
        await record_audit(
            db,
            actor_id=None,
            action="booking.overdue",
            entity="booking",
            entity_id=str(booking.id),
            before=before,
            after={"status": BookingStatus.OVERDUE.value},
        )
    return len(bookings)


async def expire_lapsed_holds(db: AsyncSession | None = None) -> int:
    if db is not None:
        return await _expire_holds(db)
    async with SessionLocal() as session:
        async with session.begin():
            return await _expire_holds(session)


async def flag_overdue_bookings(db: AsyncSession | None = None) -> int:
    if db is not None:
        return await _flag_overdue(db)
    async with SessionLocal() as session:
        async with session.begin():
            return await _flag_overdue(session)
