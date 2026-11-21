import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.models import (
    Booking,
    BookingStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)


def _vehicle(plate: str = "KCA 123A") -> Vehicle:
    return Vehicle(
        plate_number=plate,
        brand="Toyota",
        model="Landcruiser",
        year=2022,
        daily_rate_kes=15000,
        deposit_kes=30000,
        category="SUV",
        transmission="Automatic",
        fuel="Diesel",
        seats=5,
        bags=3,
        mileage_cap_km=300,
        insurance_expiry=date(2027, 1, 1),
    )


def _booking(**overrides) -> Booking:
    data = dict(
        reference="BK-2612-0001",
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc),
        return_at=datetime(2026, 12, 5, 9, 0, tzinfo=timezone.utc),
        block_until=datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc),
        total_kes=60000,
        hold_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    data.update(overrides)
    return Booking(**data)


def test_statuses_are_pascal_case():
    assert {status.value for status in BookingStatus} == {
        "Reserved",
        "Confirmed",
        "CheckedOut",
        "Overdue",
        "Completed",
        "Cancelled",
        "Expired",
    }
    # Operational state only; Reserved/Rented are derived from bookings.
    assert {status.value for status in VehicleStatus} == {
        "Available",
        "Maintenance",
    }


async def _make_agent(session) -> User:
    user = User(
        email="agent@autohire.co.ke",
        full_name="Test Agent",
        password_hash="hashed-secret",
        role=UserRole.AGENT,
    )
    session.add(user)
    await session.flush()
    return user


@pytest.mark.asyncio
async def test_create_vehicle_and_booking(db_session):
    vehicle = _vehicle()
    db_session.add(vehicle)
    await db_session.flush()

    agent = await _make_agent(db_session)

    booking = _booking(vehicle_id=vehicle.id, created_by_id=agent.id)
    db_session.add(booking)
    await db_session.commit()
    await db_session.refresh(booking)

    assert booking.status == BookingStatus.RESERVED
    assert booking.with_chauffeur is False
    assert booking.created_at is not None

    stmt = (
        select(Booking)
        .where(Booking.id == booking.id)
        .options(
            selectinload(Booking.vehicle),
            selectinload(Booking.created_by),
        )
    )
    loaded = (await db_session.execute(stmt)).scalar_one()

    assert loaded.vehicle.plate_number == "KCA 123A"
    assert loaded.vehicle.status == VehicleStatus.AVAILABLE
    assert loaded.created_by.email == "agent@autohire.co.ke"


@pytest.mark.asyncio
async def test_booking_rejects_unknown_vehicle(db_session):
    agent = await _make_agent(db_session)
    await db_session.commit()

    booking = _booking(
        reference="BK-2612-0002",
        vehicle_id=uuid.uuid4(),  # no such vehicle exists
        created_by_id=agent.id,
    )
    db_session.add(booking)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()
