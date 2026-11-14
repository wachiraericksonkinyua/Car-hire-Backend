from datetime import datetime, timezone

import pytest

from app.models import Booking, BookingStatus, User, UserRole, Vehicle, VehicleStatus
from app.schemas.booking import BookingCreate
from app.services.booking_service import (
    VehicleUnavailableError,
    create_booking,
)


def _vehicle(status: VehicleStatus = VehicleStatus.AVAILABLE) -> Vehicle:
    return Vehicle(
        plate_number="KCA 123A",
        brand="Toyota",
        model="Landcruiser",
        year=2022,
        daily_rate_kes=10000,
        deposit_kes=20000,
        status=status,
        category="SUV",
        transmission="Automatic",
        fuel="Diesel",
        seats=5,
        bags=3,
        mileage_cap_km=300,
        insurance_expiry=datetime(2027, 1, 1).date(),
    )


async def _seed(session, status: VehicleStatus, with_chauffeur: bool = False):
    """Insert a staff user and a vehicle, and commit before booking."""
    user = User(
        email="agent@autohire.co.ke",
        full_name="Test Agent",
        password_hash="hashed-secret",
        role=UserRole.AGENT,
    )
    vehicle = _vehicle(status)
    session.add_all([user, vehicle])
    await session.commit()

    data = BookingCreate(
        vehicle_id=vehicle.id,
        pickup_at=datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc),
        return_at=datetime(2026, 12, 5, 9, 0, tzinfo=timezone.utc),
        customer_name="Jane Customer",
        customer_phone="0712345678",
        with_chauffeur=with_chauffeur,
    )
    return user, vehicle, data


@pytest.mark.asyncio
async def test_create_booking_for_available_vehicle(db_session):
    user, vehicle, data = await _seed(db_session, VehicleStatus.AVAILABLE)

    booking = await create_booking(
        db_session, created_by_id=user.id, data=data
    )

    # 4 days * 10,000 = 40,000; VAT 16% = 6,400; deposit 20,000.
    assert booking.total_kes == 66400
    assert booking.pricing_snapshot["vat_kes"] == 6400
    assert booking.pricing_snapshot["deposit_kes"] == 20000
    assert booking.reference.startswith("BK-")
    assert booking.status == BookingStatus.RESERVED
    assert booking.status.value == "Reserved"
    assert booking.customer_phone == "254712345678"
    assert booking.with_chauffeur is False
    assert booking.created_at is not None
    assert booking.hold_expires_at > datetime.now(timezone.utc)

    # Operational status is not mutated; Reserved/Rented are derived.
    refreshed_vehicle = await db_session.get(Vehicle, vehicle.id)
    assert refreshed_vehicle.status == VehicleStatus.AVAILABLE

    stored = await db_session.get(Booking, booking.id)
    assert stored is not None
    assert stored.vehicle_id == vehicle.id


@pytest.mark.asyncio
async def test_reject_booking_when_vehicle_unavailable(db_session):
    user, _vehicle, data = await _seed(db_session, VehicleStatus.MAINTENANCE)

    with pytest.raises(VehicleUnavailableError):
        await create_booking(db_session, created_by_id=user.id, data=data)


@pytest.mark.asyncio
async def test_booking_references_increment_atomically(db_session):
    user, _first_vehicle, data = await _seed(
        db_session, VehicleStatus.AVAILABLE
    )

    created_by_id = user.id
    second_vehicle = _vehicle()
    second_vehicle.plate_number = "KCB 456B"
    db_session.add(second_vehicle)
    await db_session.flush()
    second_data = data.model_copy(
        update={"vehicle_id": second_vehicle.id}
    )

    first = await create_booking(
        db_session, created_by_id=created_by_id, data=data
    )
    second = await create_booking(
        db_session, created_by_id=created_by_id, data=second_data
    )

    assert first.reference.endswith("-0001")
    assert second.reference.endswith("-0002")


@pytest.mark.asyncio
async def test_chauffeur_fee_is_added(db_session):
    user, _vehicle, data = await _seed(
        db_session, VehicleStatus.AVAILABLE, with_chauffeur=True
    )

    booking = await create_booking(
        db_session, created_by_id=user.id, data=data
    )

    # (40,000 rental + 10,000 chauffeur) + 8,000 VAT + reduced 10,000 deposit.
    assert booking.total_kes == 68000
    assert booking.with_chauffeur is True
    assert booking.pricing_snapshot["chauffeur_zone"] == "in_town"
