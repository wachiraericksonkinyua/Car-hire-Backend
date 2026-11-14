import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Booking, BookingStatus, User, UserRole, Vehicle, VehicleStatus

VEHICLE_ID = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
USER_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")


def _vehicle() -> Vehicle:
    return Vehicle(
        id=VEHICLE_ID,
        plate_number="KCA 123A",
        brand="Toyota",
        model="Landcruiser",
        year=2022,
        daily_rate_kes=10000,
        deposit_kes=20000,
        status=VehicleStatus.AVAILABLE,
        category="SUV",
        transmission="Automatic",
        fuel="Diesel",
        seats=5,
        bags=3,
        mileage_cap_km=300,
        insurance_expiry=date(2027, 1, 1),
    )


def _booking(reference: str, *, vehicle_id=VEHICLE_ID, status=BookingStatus.RESERVED):
    return Booking(
        reference=reference,
        vehicle_id=vehicle_id,
        created_by_id=USER_ID,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc),
        return_at=datetime(2026, 12, 5, 9, 0, tzinfo=timezone.utc),
        block_until=datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc),
        total_kes=60000,
        status=status,
        hold_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )


async def _seed(db_session):
    db_session.add(
        User(
            id=USER_ID,
            email="agent@autohire.co.ke",
            full_name="Test Agent",
            password_hash="hashed-secret",
            role=UserRole.AGENT,
        )
    )
    db_session.add(_vehicle())
    await db_session.commit()


@pytest.mark.asyncio
async def test_exclusion_constraint_rejects_overlapping_blocking_booking(
    db_session,
):
    await _seed(db_session)
    db_session.add(_booking("BK-2612-0001"))
    await db_session.commit()

    # Same vehicle, overlapping dates, both Reserved.
    db_session.add(_booking("BK-2612-0002"))

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


@pytest.mark.asyncio
async def test_non_blocking_status_does_not_conflict(db_session):
    await _seed(db_session)
    db_session.add(
        _booking("BK-2612-0001", status=BookingStatus.COMPLETED)
    )
    await db_session.commit()

    db_session.add(_booking("BK-2612-0002", status=BookingStatus.RESERVED))
    await db_session.commit()

    count = await db_session.scalar(
        text("SELECT count(*) FROM bookings")
    )
    assert count == 2


@pytest.mark.asyncio
async def test_enum_values_are_stored_in_pascal_case(db_session):
    await _seed(db_session)
    db_session.add(_booking("BK-2612-0001"))
    await db_session.commit()

    raw_status = await db_session.scalar(
        text("SELECT status::text FROM bookings LIMIT 1")
    )
    assert raw_status == "Reserved"


@pytest.mark.asyncio
async def test_select_for_update_blocks_a_second_writer(
    db_session, session_factory
):
    await _seed(db_session)

    async with session_factory() as second_session:
        async with second_session.begin():
            await second_session.execute(
                select(Vehicle)
                .where(Vehicle.id == VEHICLE_ID)
                .with_for_update()
            )

            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(
                    db_session.execute(
                        select(Vehicle)
                        .where(Vehicle.id == VEHICLE_ID)
                        .with_for_update()
                    ),
                    timeout=0.4,
                )
