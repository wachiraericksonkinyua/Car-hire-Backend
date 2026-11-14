import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.core.permissions import Permission, has_permission
from app.core.security import create_access_token
from app.models import (
    Booking,
    BookingStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
MANAGER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
AGENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
VEHICLE_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")


def test_permission_matrix():
    assert has_permission("agent", Permission.BOOKING_APPROVE_STANDARD)
    assert not has_permission("agent", Permission.BOOKING_APPROVE_CORPORATE)
    assert has_permission("manager", Permission.BOOKING_APPROVE_CORPORATE)
    assert has_permission("owner", Permission.AUDIT_VIEW)
    assert not has_permission("manager", Permission.AUDIT_VIEW)
    assert has_permission("driver", Permission.TRIP_VIEW_OWN)
    assert not has_permission("driver", Permission.DASHBOARD_VIEW)
    assert has_permission("mechanic", Permission.MAINTENANCE_VIEW)
    assert not has_permission("mechanic", Permission.VEHICLE_MANAGE)


def _user(user_id, email, role) -> User:
    return User(
        id=user_id,
        email=email,
        full_name=role.value.title(),
        password_hash="hashed-secret",
        role=role,
    )


async def _seed(
    db_session,
    *,
    created_by_id=MANAGER_ID,
    hold_expires_at=None,
):
    users = [
        _user(OWNER_ID, "owner@autohire.ke", UserRole.OWNER),
        _user(MANAGER_ID, "manager@autohire.ke", UserRole.MANAGER),
        _user(AGENT_ID, "agent@autohire.ke", UserRole.AGENT),
    ]
    vehicle = Vehicle(
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
    booking = Booking(
        reference="BK-2612-0001",
        vehicle_id=VEHICLE_ID,
        created_by_id=created_by_id,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc),
        return_at=datetime(2026, 12, 5, 9, 0, tzinfo=timezone.utc),
        block_until=datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc),
        total_kes=60000,
        status=BookingStatus.RESERVED,
        hold_expires_at=(
            hold_expires_at
            or datetime.now(timezone.utc) + timedelta(minutes=30)
        ),
    )
    db_session.add_all([*users, vehicle, booking])
    await db_session.commit()
    return booking


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


def _approval(payment_method="Cash", reason=None) -> dict:
    body = {
        "payment_method": payment_method,
        "payment_reference": "RC-1001",
    }
    if reason is not None:
        body["reason"] = reason
    return body


@pytest.mark.asyncio
async def test_agent_cannot_approve_corporate_credit(db_session, api_client):
    booking = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.patch(
        f"/api/v1/bookings/{booking.id}/approve-offline",
        json=_approval("Corporate Credit", "Monthly account"),
    )

    assert response.status_code == 403
    assert "manager or owner" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_user_cannot_approve_booking_they_created(db_session, api_client):
    booking = await _seed(db_session, created_by_id=AGENT_ID)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.patch(
        f"/api/v1/bookings/{booking.id}/approve-offline",
        json=_approval(),
    )

    assert response.status_code == 403
    assert "cannot approve" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_expired_hold_returns_409(db_session, api_client):
    booking = await _seed(
        db_session,
        hold_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.patch(
        f"/api/v1/bookings/{booking.id}/approve-offline",
        json=_approval(),
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_owner_approval_writes_audit_and_audit_is_read_only(
    db_session, api_client
):
    booking = await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    approved = await api_client.patch(
        f"/api/v1/bookings/{booking.id}/approve-offline",
        json=_approval("Corporate Credit", "Corporate account"),
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "Confirmed"
    assert approved.json()["data"]["payment_method"] == "Corporate Credit"

    audit = await api_client.get("/api/v1/audit")
    assert audit.status_code == 200
    entries = audit.json()["data"]
    assert len(entries) == 1
    assert entries[0]["action"] == "booking.approve-offline"
    assert entries[0]["after"]["status"] == "Confirmed"

    # Agents cannot read the audit log.
    _login(api_client, AGENT_ID, "agent")
    forbidden = await api_client.get("/api/v1/audit")
    assert forbidden.status_code == 403

    # There is no update or delete route.
    _login(api_client, OWNER_ID, "owner")
    assert (await api_client.delete("/api/v1/audit")).status_code == 405
