import uuid
from datetime import date

import pytest

from app.core.security import create_access_token
from app.models import User, UserRole, Vehicle, VehicleStatus

AGENT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
OWNER_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


async def _seed(db_session) -> Vehicle:
    vehicle = Vehicle(
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
    db_session.add_all(
        [
            User(
                id=AGENT_ID,
                email="agent@autohire.co.ke",
                full_name="Test Agent",
                password_hash="hashed-secret",
                role=UserRole.AGENT,
            ),
            User(
                id=OWNER_ID,
                email="owner@autohire.ke",
                full_name="Test Owner",
                password_hash="hashed-secret",
                role=UserRole.OWNER,
            ),
            vehicle,
        ]
    )
    await db_session.commit()
    return vehicle


def _booking_payload(vehicle_id: str) -> dict:
    return {
        "vehicle_id": vehicle_id,
        "pickup_at": "2026-12-01T09:00:00Z",
        "return_at": "2026-12-05T09:00:00Z",
        "customer_name": "Jane Customer",
        "customer_phone": "0712345678",
        "customer_email": "jane@example.com",
        "with_chauffeur": False,
    }


@pytest.mark.asyncio
async def test_authenticated_user_can_create_booking(db_session, api_client):
    vehicle = await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )

    response = await api_client.post(
        "/api/v1/bookings",
        json=_booking_payload(str(vehicle.id)),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Reserved"
    assert data["total_kes"] == 66400
    assert data["reference"].startswith("BK-")
    assert data["customer_phone"] == "254712345678"


@pytest.mark.asyncio
async def test_unauthenticated_user_cannot_create_booking(db_session, api_client):
    vehicle = await _seed(db_session)

    response = await api_client.post(
        "/api/v1/bookings",
        json=_booking_payload(str(vehicle.id)),
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_owner_can_approve_offline_booking(db_session, api_client):
    vehicle = await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )
    vehicle_id = str(vehicle.id)
    created = await api_client.post(
        "/api/v1/bookings",
        json=_booking_payload(vehicle_id),
    )
    assert created.status_code == 200
    booking_id = created.json()["data"]["id"]

    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(OWNER_ID), 'owner')}"
    )
    response = await api_client.patch(
        f"/api/v1/bookings/{booking_id}/approve-offline",
        json={
            "payment_method": "Cash",
            "payment_reference": "RC-1001",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "Confirmed"

    vehicle = await api_client.get(f"/api/v1/vehicles/{vehicle_id}")
    # Operational state is unchanged; Reserved/Rented will be derived later.
    assert vehicle.json()["data"]["status"] == "Available"
