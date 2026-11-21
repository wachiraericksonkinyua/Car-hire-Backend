import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Booking,
    BookingStatus,
    Incident,
    IncidentStatus,
    Payment,
    PaymentStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.utils.time import utc_now

EAT = ZoneInfo("Africa/Nairobi")

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
AGENT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
MECHANIC_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def _vehicle(index: int) -> Vehicle:
    return Vehicle(
        id=uuid.UUID(f"10000000-0000-0000-0000-0000000000{index:02d}"),
        plate_number=f"KAA 00{index}A",
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
    status,
    pickup_at,
    return_at,
    payment_method=None,
) -> Booking:
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
        pricing_snapshot={"deposit_kes": 20000},
        status=status,
        hold_expires_at=utc_now() + timedelta(minutes=30),
        payment_method=payment_method,
    )


def _today_at(hour: int) -> datetime:
    today = utc_now().astimezone(EAT).date()
    return datetime.combine(today, time(hour), tzinfo=EAT).astimezone(
        timezone.utc
    )


async def _seed(db_session):
    now = utc_now()
    pickup_today = _today_at(12)
    return_today = _today_at(13)
    yesterday = now - timedelta(days=1)

    vehicles = [_vehicle(i) for i in range(1, 7)]
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
                id=MECHANIC_ID,
                email="mechanic@autohire.ke",
                full_name="Mechanic",
                password_hash=hash_password("MySecret123"),
                role=UserRole.MECHANIC,
            ),
            *vehicles,
        ]
    )
    await db_session.flush()

    bookings = [
        _booking(
            "BK-2612-0001",
            vehicles[0].id,
            status=BookingStatus.RESERVED,
            pickup_at=pickup_today,
            return_at=pickup_today + timedelta(days=2),
        ),
        _booking(
            "BK-2612-0002",
            vehicles[1].id,
            status=BookingStatus.CHECKED_OUT,
            pickup_at=now - timedelta(days=2),
            return_at=return_today,
        ),
        _booking(
            "BK-2612-0003",
            vehicles[2].id,
            status=BookingStatus.OVERDUE,
            pickup_at=now - timedelta(days=4),
            return_at=yesterday,
        ),
        _booking(
            "BK-2612-0004",
            vehicles[3].id,
            status=BookingStatus.CONFIRMED,
            pickup_at=now + timedelta(days=1),
            return_at=now + timedelta(days=3),
            payment_method="Cash",
        ),
    ]
    db_session.add_all(bookings)
    await db_session.flush()

    db_session.add(
        Payment(
            booking_id=bookings[1].id,
            amount_kes=50000,
            amount_due_kes=50000,
            phone="254712345678",
            checkout_request_id="ws_CO_DASH",
            status=PaymentStatus.COMPLETED,
            mpesa_receipt="QK999DASH",
        )
    )
    db_session.add(
        Incident(
            vehicle_id=vehicles[4].id,
            category="Flat Tyre",
            description="Punctured near Thika Road",
            latitude=-1.29,
            longitude=36.82,
            status=IncidentStatus.OPEN,
        )
    )
    await db_session.commit()
    return vehicles


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


@pytest.mark.asyncio
async def test_dashboard_agent_view_hides_revenue(db_session, api_client):
    vehicles = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.get("/api/v1/dashboard")
    assert response.status_code == 200

    data = response.json()["data"]
    kpis = data["kpis"]
    assert kpis["vehicles_out_today"] == 2
    assert kpis["pickups_due_today"] == 1
    assert kpis["returns_due_today"] == 1
    assert kpis["overdue"] == 1
    assert kpis["pending_approvals"] == 1
    assert kpis["active_breakdowns"] == 1
    assert kpis["monthly_revenue_kes"] is None
    assert sum(kpis["fleet_status"].values()) == 6

    assert [item["reference"] for item in data["pickups_today"]] == [
        "BK-2612-0001"
    ]
    assert [item["reference"] for item in data["returns_today"]] == [
        "BK-2612-0002"
    ]
    assert data["pickups_today"][0]["vehicle_plate"] == vehicles[0].plate_number


@pytest.mark.asyncio
async def test_dashboard_owner_sees_revenue(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    response = await api_client.get("/api/v1/dashboard")

    assert response.status_code == 200
    assert response.json()["data"]["kpis"]["monthly_revenue_kes"] == 50000


@pytest.mark.asyncio
async def test_dashboard_permissions(db_session, api_client):
    await _seed(db_session)

    unauthenticated = await api_client.get("/api/v1/dashboard")
    assert unauthenticated.status_code == 401

    _login(api_client, MECHANIC_ID, "mechanic")
    forbidden = await api_client.get("/api/v1/dashboard")
    assert forbidden.status_code == 403
