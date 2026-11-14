import uuid
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.jobs.booking_jobs import expire_lapsed_holds, flag_overdue_bookings
from app.models import (
    Booking,
    BookingStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.utils.time import utc_now

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
AGENT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


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
    reference,
    vehicle_id,
    *,
    status=BookingStatus.RESERVED,
    pickup_days=2,
    hold_minutes=30,
    return_hours_ago=0,
    payment_method=None,
) -> Booking:
    now = utc_now()
    if return_hours_ago:
        return_at = now - timedelta(hours=return_hours_ago)
        pickup_at = return_at - timedelta(days=2)
    else:
        pickup_at = now + timedelta(days=pickup_days)
        return_at = pickup_at + timedelta(days=4)
    return Booking(
        reference=reference,
        vehicle_id=vehicle_id,
        created_by_id=AGENT_ID,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=pickup_at,
        return_at=return_at,
        block_until=return_at + timedelta(minutes=60),
        total_kes=66400,
        status=status,
        hold_expires_at=now + timedelta(minutes=hold_minutes),
        payment_method=payment_method,
    )


async def _users(db_session):
    db_session.add_all(
        [
            User(
                id=OWNER_ID,
                email="owner@autohire.ke",
                full_name="Owner User",
                password_hash=hash_password("MySecret123"),
                role=UserRole.OWNER,
            ),
            User(
                id=AGENT_ID,
                email="agent@autohire.ke",
                full_name="Agent User",
                password_hash=hash_password("MySecret123"),
                role=UserRole.AGENT,
            ),
        ]
    )
    await db_session.commit()


def _login(client, user_id=AGENT_ID, role="agent"):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


@pytest.mark.asyncio
async def test_booking_list_filters_and_detail(db_session, api_client):
    await _users(db_session)
    specs = [
        ("10000000-0000-0000-0000-000000000001", "KAA 001A", "BK-2612-0001", BookingStatus.RESERVED, None),
        ("10000000-0000-0000-0000-000000000002", "KAA 002A", "BK-2612-0002", BookingStatus.CONFIRMED, "Cash"),
        ("10000000-0000-0000-0000-000000000003", "KAA 003A", "BK-2612-0003", BookingStatus.COMPLETED, "Bank EFT"),
        ("10000000-0000-0000-0000-000000000004", "KAA 004A", "BK-2612-0004", BookingStatus.CANCELLED, None),
        ("10000000-0000-0000-0000-000000000005", "KAA 005A", "BK-2612-0005", BookingStatus.CHECKED_OUT, "M-Pesa Manual"),
    ]
    for raw_id, plate, reference, booking_status, method in specs:
        vehicle_id = uuid.UUID(raw_id)
        db_session.add(_vehicle(vehicle_id, plate))
        db_session.add(
            _booking(
                reference,
                vehicle_id,
                status=booking_status,
                payment_method=method,
            )
        )
    await db_session.commit()
    _login(api_client)

    all_bookings = await api_client.get("/api/v1/bookings")
    assert all_bookings.status_code == 200
    data = all_bookings.json()["data"]
    assert data["total"] == 5
    assert len(data["items"]) == 5

    reserved = await api_client.get("/api/v1/bookings?status=Reserved")
    assert reserved.json()["data"]["total"] == 1

    pending = await api_client.get("/api/v1/bookings?pending_approval=true")
    assert pending.json()["data"]["total"] == 1
    assert pending.json()["data"]["items"][0]["reference"] == "BK-2612-0001"

    by_method = await api_client.get("/api/v1/bookings?payment_method=Cash")
    assert by_method.json()["data"]["total"] == 1

    search = await api_client.get("/api/v1/bookings?search=BK-2612-0003")
    assert search.json()["data"]["total"] == 1

    page = await api_client.get("/api/v1/bookings?limit=2&offset=0")
    assert len(page.json()["data"]["items"]) == 2
    assert page.json()["data"]["total"] == 5

    booking_id = data["items"][0]["id"]
    detail = await api_client.get(f"/api/v1/bookings/{booking_id}")
    assert detail.status_code == 200
    detail_data = detail.json()["data"]
    assert detail_data["vehicle"]["plate_number"]
    assert detail_data["created_by"]["full_name"] == "Agent User"


@pytest.mark.asyncio
async def test_cancel_booking_writes_audit_and_is_idempotent_guard(
    db_session, api_client
):
    await _users(db_session)
    vehicle_id = uuid.UUID("10000000-0000-0000-0000-000000000010")
    db_session.add(_vehicle(vehicle_id, "KAA 010A"))
    booking = _booking("BK-2612-0010", vehicle_id)
    db_session.add(booking)
    await db_session.commit()
    _login(api_client)

    response = await api_client.post(
        f"/api/v1/bookings/{booking.id}/cancel"
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "Cancelled"

    again = await api_client.post(f"/api/v1/bookings/{booking.id}/cancel")
    assert again.status_code == 409

    _login(api_client, OWNER_ID, "owner")
    audit = await api_client.get("/api/v1/audit?action=booking.cancel")
    assert audit.json()["data"][0]["entity_id"] == str(booking.id)


@pytest.mark.asyncio
async def test_hold_expiry_job(db_session):
    await _users(db_session)
    vehicle_id = uuid.UUID("10000000-0000-0000-0000-000000000020")
    db_session.add(_vehicle(vehicle_id, "KAA 020A"))
    expired = _booking("BK-2612-0020", vehicle_id, hold_minutes=-1)
    live = _booking("BK-2612-0021", vehicle_id, hold_minutes=30)
    # Non-overlapping so the exclusion constraint is satisfied.
    live.pickup_at = expired.return_at + timedelta(days=10)
    live.return_at = live.pickup_at + timedelta(days=4)
    live.block_until = live.return_at + timedelta(minutes=60)
    db_session.add_all([expired, live])
    await db_session.commit()

    assert await expire_lapsed_holds(db_session) == 1
    await db_session.commit()
    await db_session.refresh(expired)
    await db_session.refresh(live)

    assert expired.status == BookingStatus.EXPIRED
    assert live.status == BookingStatus.RESERVED
    assert await expire_lapsed_holds(db_session) == 0
    await db_session.commit()


@pytest.mark.asyncio
async def test_overdue_job_respects_grace_period(db_session):
    await _users(db_session)
    overdue_v = uuid.UUID("10000000-0000-0000-0000-000000000030")
    recent_v = uuid.UUID("10000000-0000-0000-0000-000000000031")
    db_session.add_all(
        [
            _vehicle(overdue_v, "KAA 030A"),
            _vehicle(recent_v, "KAA 031A"),
        ]
    )
    overdue = _booking(
        "BK-2612-0030",
        overdue_v,
        status=BookingStatus.CHECKED_OUT,
        return_hours_ago=3,
    )
    recent = _booking(
        "BK-2612-0031",
        recent_v,
        status=BookingStatus.CHECKED_OUT,
        return_hours_ago=1,
    )
    db_session.add_all([overdue, recent])
    await db_session.commit()

    assert await flag_overdue_bookings(db_session) == 1
    await db_session.commit()
    await db_session.refresh(overdue)
    await db_session.refresh(recent)

    assert overdue.status == BookingStatus.OVERDUE
    assert recent.status == BookingStatus.CHECKED_OUT


@pytest.mark.asyncio
async def test_driver_cannot_use_general_booking_list(db_session, api_client):
    driver_id = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    db_session.add(
        User(
            id=driver_id,
            email="driver@autohire.ke",
            full_name="Driver",
            password_hash=hash_password("MySecret123"),
            role=UserRole.DRIVER,
        )
    )
    await db_session.commit()
    _login(api_client, driver_id, "driver")

    response = await api_client.get("/api/v1/bookings")

    assert response.status_code == 403
