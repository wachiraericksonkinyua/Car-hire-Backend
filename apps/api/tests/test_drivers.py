import uuid
from datetime import date, datetime, timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Booking,
    BookingStatus,
    DriverProfile,
    DriverStatus,
    TripStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.utils.time import utc_now

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
AGENT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
D1 = uuid.UUID("d1000000-0000-0000-0000-000000000001")
D2 = uuid.UUID("d2000000-0000-0000-0000-000000000002")
D3 = uuid.UUID("d3000000-0000-0000-0000-000000000003")
D4 = uuid.UUID("d4000000-0000-0000-0000-000000000004")
D5 = uuid.UUID("d5000000-0000-0000-0000-000000000005")

P1 = uuid.UUID("e1000000-0000-0000-0000-000000000001")
P2 = uuid.UUID("e2000000-0000-0000-0000-000000000002")
P3 = uuid.UUID("e3000000-0000-0000-0000-000000000003")
P4 = uuid.UUID("e4000000-0000-0000-0000-000000000004")
P5 = uuid.UUID("e5000000-0000-0000-0000-000000000005")

V1 = uuid.UUID("f1000000-0000-0000-0000-000000000001")
V2 = uuid.UUID("f2000000-0000-0000-0000-000000000002")
V3 = uuid.UUID("f3000000-0000-0000-0000-000000000003")
V4 = uuid.UUID("f4000000-0000-0000-0000-000000000004")

B1 = uuid.UUID("b1000000-0000-0000-0000-000000000001")
B2 = uuid.UUID("b2000000-0000-0000-0000-000000000002")
B3 = uuid.UUID("b3000000-0000-0000-0000-000000000003")
B4 = uuid.UUID("b4000000-0000-0000-0000-000000000004")


def _user(user_id, email, role) -> User:
    return User(
        id=user_id,
        email=email,
        full_name=email.split("@")[0].title(),
        phone="254712345678",
        password_hash=hash_password("MySecret123"),
        role=role,
    )


def _profile(profile_id, user_id, *, licence=date(2030, 1, 1), psv=date(2030, 1, 1), status=DriverStatus.AVAILABLE):
    return DriverProfile(
        id=profile_id,
        user_id=user_id,
        licence_class="D1",
        licence_expiry=licence,
        psv_expiry=psv,
        status=status,
    )


def _vehicle(vehicle_id, plate) -> Vehicle:
    return Vehicle(
        id=vehicle_id,
        plate_number=plate,
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


def _booking(
    booking_id,
    reference,
    vehicle_id,
    *,
    with_chauffeur=True,
    driver_id=None,
    pickup=None,
) -> Booking:
    now = utc_now()
    pickup = pickup or now + timedelta(days=2)
    return_at = pickup + timedelta(days=2)
    return Booking(
        id=booking_id,
        reference=reference,
        vehicle_id=vehicle_id,
        created_by_id=AGENT_ID,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=pickup,
        return_at=return_at,
        block_until=return_at + timedelta(minutes=60),
        total_kes=68000,
        pricing_snapshot={"deposit_kes": 10000},
        status=BookingStatus.CONFIRMED,
        hold_expires_at=now + timedelta(minutes=30),
        with_chauffeur=with_chauffeur,
        driver_id=driver_id,
        trip_status=TripStatus.ASSIGNED if driver_id else None,
    )


async def _seed(db_session):
    now = utc_now()
    pickup = now + timedelta(days=2)

    db_session.add_all(
        [
            _user(OWNER_ID, "owner@autohire.ke", UserRole.OWNER),
            _user(AGENT_ID, "agent@autohire.ke", UserRole.AGENT),
            _user(D1, "driver1@autohire.ke", UserRole.DRIVER),
            _user(D2, "driver2@autohire.ke", UserRole.DRIVER),
            _user(D3, "driver3@autohire.ke", UserRole.DRIVER),
            _user(D4, "driver4@autohire.ke", UserRole.DRIVER),
            _user(D5, "driver5@autohire.ke", UserRole.DRIVER),
            _profile(P1, D1),
            _profile(P2, D2, licence=now.date() - timedelta(days=1)),
            _profile(P3, D3, psv=now.date() - timedelta(days=1)),
            _profile(P4, D4, status=DriverStatus.OFF_DUTY),
            _profile(P5, D5),
            _vehicle(V1, "KAA 001A"),
            _vehicle(V2, "KAA 002A"),
            _vehicle(V3, "KAA 003A"),
            _vehicle(V4, "KAA 004A"),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            _booking(B1, "BK-2612-0001", V1),
            _booking(
                B2,
                "BK-2612-0002",
                V2,
                driver_id=P5,
                pickup=pickup,
            ),
            _booking(B3, "BK-2612-0003", V3, with_chauffeur=False),
            _booking(B4, "BK-2612-0004", V4, pickup=pickup),
        ]
    )
    await db_session.commit()
    return pickup


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


def _window(pickup):
    return {
        "from": pickup.isoformat(),
        "to": (pickup + timedelta(days=2)).isoformat(),
    }


@pytest.mark.asyncio
async def test_driver_roster_and_availability(db_session, api_client):
    pickup = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    roster = await api_client.get("/api/v1/drivers")
    assert roster.status_code == 200
    assert len(roster.json()["data"]) == 5

    available = await api_client.get(
        "/api/v1/drivers/available",
        params={**_window(pickup), "vehicle_id": str(V1)},
    )
    assert available.status_code == 200
    names = {item["full_name"] for item in available.json()["data"]}
    # d2 expired licence, d3 expired PSV, d4 off duty, d5 overlapping trip.
    assert names == {"Driver1"}


@pytest.mark.asyncio
async def test_assign_driver_and_release_on_cancel(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    assigned = await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert assigned.status_code == 200
    assert assigned.json()["data"]["driver_id"] == str(P1)
    assert assigned.json()["data"]["trip_status"] == "Assigned"

    profile = await db_session.get(DriverProfile, P1)
    await db_session.refresh(profile)
    assert profile.status == DriverStatus.ASSIGNED

    again = await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert again.status_code == 409

    cancelled = await api_client.post(f"/api/v1/bookings/{B1}/cancel")
    assert cancelled.status_code == 200
    await db_session.refresh(profile)
    assert profile.status == DriverStatus.AVAILABLE


@pytest.mark.asyncio
async def test_assignment_conflicts_and_expired_drivers(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    expired = await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P2)},
    )
    assert expired.status_code == 409

    assigned = await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert assigned.status_code == 200

    double = await api_client.patch(
        f"/api/v1/bookings/{B4}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert double.status_code == 409

    self_drive = await api_client.patch(
        f"/api/v1/bookings/{B3}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert self_drive.status_code == 409


@pytest.mark.asyncio
async def test_driver_only_sees_own_trips_and_updates_status(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")
    await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P1)},
    )

    _login(api_client, D1, "driver")
    trips = await api_client.get("/api/v1/drivers/my-trips")
    assert trips.status_code == 200
    assert [trip["booking_id"] for trip in trips.json()["data"]] == [str(B1)]

    en_route = await api_client.patch(
        f"/api/v1/drivers/my-trips/{B1}",
        json={"status": "EnRoute"},
    )
    assert en_route.status_code == 200
    assert en_route.json()["data"]["trip_status"] == "EnRoute"

    invalid = await api_client.patch(
        f"/api/v1/drivers/my-trips/{B1}",
        json={"status": "Completed"},
    )
    assert invalid.status_code == 409

    onboard = await api_client.patch(
        f"/api/v1/drivers/my-trips/{B1}",
        json={"status": "CustomerOnboard"},
    )
    assert onboard.status_code == 200

    completed = await api_client.patch(
        f"/api/v1/drivers/my-trips/{B1}",
        json={"status": "Completed"},
    )
    assert completed.status_code == 200

    # Another driver cannot touch this trip.
    _login(api_client, D2, "driver")
    other = await api_client.patch(
        f"/api/v1/drivers/my-trips/{B1}",
        json={"status": "EnRoute"},
    )
    assert other.status_code == 404


@pytest.mark.asyncio
async def test_driver_endpoint_permissions(db_session, api_client):
    await _seed(db_session)

    _login(api_client, D1, "driver")
    roster = await api_client.get("/api/v1/drivers")
    assert roster.status_code == 403

    _login(api_client, AGENT_ID, "agent")
    mechanic = await api_client.get("/api/v1/drivers/my-trips")
    assert mechanic.status_code == 403


@pytest.mark.asyncio
async def test_driver_profile_create_update_and_offduty_guard(
    db_session, api_client
):
    await _seed(db_session)
    new_user_id = uuid.UUID("d6000000-0000-0000-0000-000000000006")
    db_session.add(
        User(
            id=new_user_id,
            email="driver6@autohire.ke",
            full_name="Driver Six",
            phone="254712345679",
            password_hash="hashed-secret",
            role=UserRole.DRIVER,
        )
    )
    await db_session.commit()
    _login(api_client, OWNER_ID, "owner")

    created = await api_client.post(
        "/api/v1/drivers",
        json={
            "user_id": str(new_user_id),
            "licence_class": "D1",
            "licence_expiry": "2030-01-01",
            "psv_expiry": "2030-01-01",
            "languages": ["English"],
            "rating": 4.5,
        },
    )
    assert created.status_code == 200
    profile_id = created.json()["data"]["id"]

    duplicate = await api_client.post(
        "/api/v1/drivers",
        json={
            "user_id": str(new_user_id),
            "licence_class": "D1",
            "licence_expiry": "2030-01-01",
            "psv_expiry": "2030-01-01",
        },
    )
    assert duplicate.status_code == 409

    updated = await api_client.patch(
        f"/api/v1/drivers/{profile_id}",
        json={"status": "OffDuty", "rating": 4.8},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["status"] == "OffDuty"

    # An assigned/upcoming driver cannot be set off duty.
    assigned = await api_client.patch(
        f"/api/v1/bookings/{B1}/assign-driver",
        json={"driver_id": str(P1)},
    )
    assert assigned.status_code == 200
    blocked = await api_client.patch(
        f"/api/v1/drivers/{P1}",
        json={"status": "OffDuty"},
    )
    assert blocked.status_code == 409

    _login(api_client, AGENT_ID, "agent")
    forbidden = await api_client.post(
        "/api/v1/drivers",
        json={
            "user_id": str(new_user_id),
            "licence_class": "D1",
            "licence_expiry": "2030-01-01",
            "psv_expiry": "2030-01-01",
        },
    )
    assert forbidden.status_code == 403
