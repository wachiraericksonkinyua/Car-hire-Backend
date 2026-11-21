import uuid
from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
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

V_RESERVED = uuid.UUID("10000000-0000-0000-0000-000000000001")
V_RENTED = uuid.UUID("10000000-0000-0000-0000-000000000002")
V_MAINT = uuid.UUID("10000000-0000-0000-0000-000000000003")
V_FREE = uuid.UUID("10000000-0000-0000-0000-000000000004")
V_BUFFER = uuid.UUID("10000000-0000-0000-0000-000000000005")
V_EXPIRED = uuid.UUID("10000000-0000-0000-0000-000000000006")


def _vehicle(vehicle_id, plate, *, status=VehicleStatus.AVAILABLE, insurance=None):
    return Vehicle(
        id=vehicle_id,
        plate_number=plate,
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
        insurance_expiry=insurance or date(2030, 1, 1),
    )


def _booking(reference, vehicle_id, pickup, return_at, status):
    return Booking(
        reference=reference,
        vehicle_id=vehicle_id,
        created_by_id=AGENT_ID,
        customer_name="Jane Customer",
        customer_phone="254712345678",
        pickup_at=pickup,
        return_at=return_at,
        block_until=return_at + timedelta(minutes=60),
        total_kes=66400,
        status=status,
        hold_expires_at=utc_now() + timedelta(minutes=30),
    )


async def _seed(db_session):
    now = utc_now()
    pickup = now + timedelta(days=2)
    return_at = now + timedelta(days=6)

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
            _vehicle(V_RESERVED, "KAA 001A"),
            _vehicle(V_RENTED, "KAA 002A"),
            _vehicle(V_MAINT, "KAA 003A", status=VehicleStatus.MAINTENANCE),
            _vehicle(V_FREE, "KAA 004A"),
            _vehicle(V_BUFFER, "KAA 005A"),
            _vehicle(
                V_EXPIRED,
                "KAA 006A",
                insurance=now.date() - timedelta(days=1),
            ),
            _booking(
                "BK-2612-0001",
                V_RESERVED,
                pickup,
                return_at,
                BookingStatus.RESERVED,
            ),
            _booking(
                "BK-2612-0002",
                V_RENTED,
                pickup,
                return_at,
                BookingStatus.CHECKED_OUT,
            ),
            _booking(
                "BK-2612-0003",
                V_BUFFER,
                now + timedelta(days=10),
                now + timedelta(days=12),
                BookingStatus.RESERVED,
            ),
        ]
    )
    await db_session.commit()
    return pickup, return_at


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


def _params(pickup, return_at):
    return {
        "from": pickup.isoformat(),
        "to": return_at.isoformat(),
    }


@pytest.mark.asyncio
async def test_derived_status_and_filters(db_session, api_client):
    pickup, return_at = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    window = {
        "from": (pickup + timedelta(hours=1)).isoformat(),
        "to": (return_at - timedelta(hours=1)).isoformat(),
    }
    response = await api_client.get("/api/v1/vehicles", params=window)
    assert response.status_code == 200

    by_id = {item["id"]: item for item in response.json()["data"]["items"]}
    assert by_id[str(V_RESERVED)]["status"] == "Reserved"
    assert by_id[str(V_RENTED)]["status"] == "Rented"
    assert by_id[str(V_MAINT)]["status"] == "Maintenance"
    assert by_id[str(V_FREE)]["status"] == "Available"

    rented = await api_client.get(
        "/api/v1/vehicles", params={**window, "status": "Rented"}
    )
    assert [item["id"] for item in rented.json()["data"]["items"]] == [
        str(V_RENTED)
    ]

    available = await api_client.get(
        "/api/v1/vehicles", params={**window, "available_only": True}
    )
    available_ids = {
        item["id"] for item in available.json()["data"]["items"]
    }
    assert str(V_FREE) in available_ids
    assert str(V_RESERVED) not in available_ids
    assert str(V_MAINT) not in available_ids


@pytest.mark.asyncio
async def test_turnaround_buffer_is_enforced(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    buffer_booking = await _get_booking(db_session, "BK-2612-0003")
    return_at = buffer_booking.return_at

    during_buffer = await api_client.get(
        "/api/v1/vehicles",
        params={
            "from": (return_at + timedelta(minutes=30)).isoformat(),
            "to": (return_at + timedelta(hours=2)).isoformat(),
            "plate": "KAA 005A",
        },
    )
    assert during_buffer.json()["data"]["items"][0]["status"] == "Reserved"

    after_buffer = await api_client.get(
        "/api/v1/vehicles",
        params={
            "from": (return_at + timedelta(minutes=60)).isoformat(),
            "to": (return_at + timedelta(hours=2)).isoformat(),
            "plate": "KAA 005A",
        },
    )
    assert after_buffer.json()["data"]["items"][0]["status"] == "Available"


async def _get_booking(db_session, reference):
    return await db_session.scalar(
        select(Booking).where(Booking.reference == reference)
    )


@pytest.mark.asyncio
async def test_detail_includes_30_day_ranges(db_session, api_client):
    pickup, return_at = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.get(
        f"/api/v1/vehicles/{V_RESERVED}",
        params={
            "from": (pickup + timedelta(hours=1)).isoformat(),
            "to": (return_at - timedelta(hours=1)).isoformat(),
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Reserved"
    assert len(data["booked_ranges"]) == 1
    assert data["booked_ranges"][0]["reference"] == "BK-2612-0001"


@pytest.mark.asyncio
async def test_pagination_and_filters(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    page = await api_client.get("/api/v1/vehicles?limit=2&offset=0")
    data = page.json()["data"]
    assert data["total"] == 6
    assert len(data["items"]) == 2
    assert data["limit"] == 2

    by_plate = await api_client.get("/api/v1/vehicles?plate=KAA 00")
    assert by_plate.json()["data"]["total"] == 6

    by_seats = await api_client.get("/api/v1/vehicles?seats=7")
    assert by_seats.json()["data"]["total"] == 0


@pytest.mark.asyncio
async def test_expired_insurance_cannot_be_booked(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    detail = await api_client.get(f"/api/v1/vehicles/{V_EXPIRED}")
    assert detail.json()["data"]["insurance_expired"] is True

    pickup, return_at = await _dates(db_session)
    response = await api_client.post(
        "/api/v1/bookings",
        json={
            "vehicle_id": str(V_EXPIRED),
            "pickup_at": pickup.isoformat(),
            "return_at": return_at.isoformat(),
            "customer_name": "Jane Customer",
            "customer_phone": "0712345678",
        },
    )
    assert response.status_code == 409


async def _dates(db_session):
    now = utc_now()
    return now + timedelta(days=2), now + timedelta(days=6)


@pytest.mark.asyncio
async def test_create_vehicle_validates_plate_and_duplicate(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    duplicate = await api_client.post(
        "/api/v1/vehicles",
        json={
            "plate_number": "KAA 001A",
            "brand": "Toyota",
            "model": "Prado",
            "year": 2021,
            "category": "SUV",
            "transmission": "Automatic",
            "fuel": "Petrol",
            "seats": 5,
            "bags": 2,
            "daily_rate_kes": 9000,
            "deposit_kes": 20000,
            "mileage_cap_km": 300,
            "insurance_expiry": "2030-01-01",
        },
    )
    assert duplicate.status_code == 409

    invalid = await api_client.post(
        "/api/v1/vehicles",
        json={
            "plate_number": "NOPE",
            "brand": "Toyota",
            "model": "Prado",
            "year": 2021,
            "category": "SUV",
            "transmission": "Automatic",
            "fuel": "Petrol",
            "seats": 5,
            "daily_rate_kes": 9000,
            "deposit_kes": 20000,
            "mileage_cap_km": 300,
            "insurance_expiry": "2030-01-01",
        },
    )
    assert invalid.status_code == 422

    created = await api_client.post(
        "/api/v1/vehicles",
        json={
            "plate_number": "kaa 007a",
            "brand": "Toyota",
            "model": "Prado",
            "year": 2021,
            "category": "SUV",
            "transmission": "Automatic",
            "fuel": "Petrol",
            "seats": 5,
            "bags": 2,
            "daily_rate_kes": 9000,
            "deposit_kes": 20000,
            "mileage_cap_km": 300,
            "insurance_expiry": "2030-01-01",
        },
    )
    assert created.status_code == 200
    assert created.json()["data"]["plate_number"] == "KAA 007A"


@pytest.mark.asyncio
async def test_update_vehicle_writes_price_change_audit(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    updated = await api_client.patch(
        f"/api/v1/vehicles/{V_FREE}",
        json={"daily_rate_kes": 12500},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["daily_rate_kes"] == 12500

    audit = await api_client.get("/api/v1/audit?action=vehicle.update")
    assert audit.status_code == 200
    entries = audit.json()["data"]
    assert len(entries) == 1
    assert entries[0]["before"]["daily_rate_kes"] == 10000
    assert entries[0]["after"]["daily_rate_kes"] == 12500


@pytest.mark.asyncio
async def test_booking_overlap_returns_409(db_session, api_client):
    pickup, return_at = await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.post(
        "/api/v1/bookings",
        json={
            "vehicle_id": str(V_RESERVED),
            "pickup_at": (pickup + timedelta(hours=1)).isoformat(),
            "return_at": (return_at - timedelta(hours=1)).isoformat(),
            "customer_name": "Jane Customer",
            "customer_phone": "0712345678",
        },
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_vehicle_delete_cascades_history(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    deleted = await api_client.delete(f"/api/v1/vehicles/{V_RESERVED}")
    assert deleted.status_code == 200
    body = deleted.json()["data"]
    assert body["deleted"] is True
    assert body["bookings_deleted"] == 1
    assert body["incidents_deleted"] == 0

    assert await db_session.get(Vehicle, V_RESERVED) is None
    remaining = await db_session.scalar(
        select(Booking.id).where(Booking.vehicle_id == V_RESERVED)
    )
    assert remaining is None

    _login(api_client, AGENT_ID, "agent")
    forbidden = await api_client.delete(f"/api/v1/vehicles/{V_FREE}")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_vehicle_photo_upload_and_public_serving(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    uploaded = await api_client.post(
        f"/api/v1/vehicles/{V_FREE}/photos",
        files={"file": ("car.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert uploaded.status_code == 200
    photo = uploaded.json()["data"]
    assert photo["url"].endswith(
        f"/api/v1/public/vehicles/{V_FREE}/photos/{photo['id']}"
    )

    served = await api_client.get(
        f"/api/v1/public/vehicles/{V_FREE}/photos/{photo['id']}"
    )
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"

    listed = await api_client.get(f"/api/v1/vehicles/{V_FREE}")
    assert listed.status_code == 200
    assert len(listed.json()["data"]["photos"]) == 1

    removed = await api_client.delete(
        f"/api/v1/vehicles/{V_FREE}/photos/{photo['id']}"
    )
    assert removed.status_code == 200
