import uuid
from datetime import date, datetime, timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Booking,
    BookingStatus,
    Inspection,
    InspectionKind,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.utils.time import utc_now

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
AGENT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
DRIVER_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
VEHICLE_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
BOOKING_ID = uuid.UUID("20000000-0000-0000-0000-000000000001")


def _vehicle() -> Vehicle:
    return Vehicle(
        id=VEHICLE_ID,
        plate_number="KAA 001A",
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
        insurance_expiry=date(2030, 1, 1),
    )


def _booking(*, status=BookingStatus.CONFIRMED, return_offset_hours=24) -> Booking:
    now = utc_now()
    return_at = now + timedelta(hours=return_offset_hours)
    return Booking(
        id=BOOKING_ID,
        reference="BK-2612-0001",
        vehicle_id=VEHICLE_ID,
        created_by_id=AGENT_ID,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=return_at - timedelta(days=2),
        return_at=return_at,
        block_until=return_at + timedelta(minutes=60),
        total_kes=66400,
        pricing_snapshot={"deposit_kes": 20000},
        status=status,
        hold_expires_at=now + timedelta(minutes=30),
    )


async def _seed(db_session, *, status=BookingStatus.CONFIRMED, return_offset_hours=24):
    db_session.add_all(
        [
            User(
                id=OWNER_ID,
                email="owner@autohire.ke",
                full_name="Owner",
                password_hash=hash_password("MySecret123"),
                role=UserRole.OWNER,
            ),
            User(
                id=AGENT_ID,
                email="agent@autohire.ke",
                full_name="Agent",
                password_hash=hash_password("MySecret123"),
                role=UserRole.AGENT,
            ),
            User(
                id=DRIVER_ID,
                email="driver@autohire.ke",
                full_name="Driver",
                password_hash=hash_password("MySecret123"),
                role=UserRole.DRIVER,
            ),
            _vehicle(),
            _booking(status=status, return_offset_hours=return_offset_hours),
        ]
    )
    await db_session.commit()


def _login(client, user_id=AGENT_ID, role="agent"):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


def _handover(**overrides) -> dict:
    body = {
        "fuel_percent": 100,
        "odometer_km": 1000,
        "photos": ["https://example.com/front.jpg"],
        "notes": "Clean",
        "signature": "signed-by-customer",
        "confirmation": True,
        "critical_defect": False,
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_full_handover_cycle(db_session, api_client):
    await _seed(db_session)
    _login(api_client)

    checkout = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-out",
        json=_handover(),
    )
    assert checkout.status_code == 200
    assert checkout.json()["data"]["kind"] == "CheckOut"

    booking = await db_session.get(Booking, BOOKING_ID)
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CHECKED_OUT

    checkin = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-in",
        json=_handover(odometer_km=1200, fuel_percent=90),
    )
    assert checkin.status_code == 200
    data = checkin.json()["data"]
    assert data["booking_status"] == "Completed"
    assert data["vehicle_status"] == "Available"
    assert data["settlement"]["late_fee_kes"] == 0
    assert data["settlement"]["excess_mileage_kes"] == 0
    assert data["settlement"]["refund_due_kes"] == 20000

    vehicle = await db_session.get(Vehicle, VEHICLE_ID)
    await db_session.refresh(vehicle)
    assert vehicle.status == VehicleStatus.AVAILABLE

    _login(api_client, OWNER_ID, "owner")
    audit = await api_client.get("/api/v1/audit?entity=booking")
    actions = {entry["action"] for entry in audit.json()["data"]}
    assert {"booking.check-out", "booking.check-in"} <= actions


@pytest.mark.asyncio
async def test_check_in_charges_late_fee_and_excess_mileage(db_session, api_client):
    await _seed(
        db_session,
        status=BookingStatus.CHECKED_OUT,
        return_offset_hours=-3.5,
    )
    db_session.add(
        Inspection(
            booking_id=BOOKING_ID,
            kind=InspectionKind.CHECK_OUT,
            fuel_percent=100,
            odometer_km=1000,
            photos=[],
            notes=None,
            signature="signed",
            confirmation=True,
            critical_defect=False,
            created_by_id=AGENT_ID,
        )
    )
    await db_session.commit()
    _login(api_client)

    response = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-in",
        json=_handover(
            odometer_km=1500,
            critical_defect=True,
            fuel_percent=50,
        ),
    )

    assert response.status_code == 200
    settlement = response.json()["data"]["settlement"]
    # 3.5h late minus 2h grace = 1.5h, rounded up to 2 started hours.
    assert settlement["late_fee_kes"] == 1000
    # 500 km driven - 300 km cap = 200 km * 50.
    assert settlement["excess_mileage_kes"] == 10000
    assert settlement["total_charges_kes"] == 11000
    assert settlement["refund_due_kes"] == 9000
    assert response.json()["data"]["critical_defect"] is True

    vehicle = await db_session.get(Vehicle, VEHICLE_ID)
    await db_session.refresh(vehicle)
    assert vehicle.status == VehicleStatus.MAINTENANCE


@pytest.mark.asyncio
async def test_check_in_rejects_lower_odometer(db_session, api_client):
    await _seed(db_session, status=BookingStatus.CHECKED_OUT)
    db_session.add(
        Inspection(
            booking_id=BOOKING_ID,
            kind=InspectionKind.CHECK_OUT,
            fuel_percent=100,
            odometer_km=1000,
            photos=[],
            notes=None,
            signature="signed",
            confirmation=True,
            critical_defect=False,
            created_by_id=AGENT_ID,
        )
    )
    await db_session.commit()
    _login(api_client)

    response = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-in",
        json=_handover(odometer_km=900),
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_handover_status_guards_and_permissions(db_session, api_client):
    await _seed(db_session, status=BookingStatus.RESERVED)
    _login(api_client)

    wrong_status = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-out", json=_handover()
    )
    assert wrong_status.status_code == 409

    _login(api_client, DRIVER_ID, "driver")
    forbidden = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-out", json=_handover()
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_handover_requires_signature_or_confirmation(db_session, api_client):
    await _seed(db_session)
    _login(api_client)

    response = await api_client.post(
        f"/api/v1/bookings/{BOOKING_ID}/check-out",
        json=_handover(signature=None, confirmation=False),
    )

    assert response.status_code == 422
