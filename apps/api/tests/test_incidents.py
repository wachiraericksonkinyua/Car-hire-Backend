import uuid
from datetime import date, timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Booking,
    BookingStatus,
    Mechanic,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.utils.time import utc_now

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
AGENT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
MECHANIC_USER_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
VEHICLE_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
BOOKING_ID = uuid.UUID("20000000-0000-0000-0000-000000000001")
PARTNER_ID = uuid.UUID("30000000-0000-0000-0000-000000000001")


def _user(user_id, email, role) -> User:
    return User(
        id=user_id,
        email=email,
        full_name=email.split("@")[0].title(),
        password_hash=hash_password("MySecret123"),
        role=role,
    )


async def _seed(db_session):
    now = utc_now()
    pickup = now + timedelta(days=2)
    db_session.add_all(
        [
            _user(OWNER_ID, "owner@autohire.ke", UserRole.OWNER),
            _user(AGENT_ID, "agent@autohire.ke", UserRole.AGENT),
            _user(
                MECHANIC_USER_ID,
                "mechanic@autohire.ke",
                UserRole.MECHANIC,
            ),
            Vehicle(
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
            ),
            Mechanic(
                id=PARTNER_ID,
                name="Partner Garage",
                phone="254712345678",
                county="Nairobi",
                latitude=-1.29,
                longitude=36.82,
                mechanic_type="PartnerGarage",
                is_available=True,
            ),
        ]
    )
    db_session.add(
        Booking(
            id=BOOKING_ID,
            reference="BK-2612-0001",
            vehicle_id=VEHICLE_ID,
            created_by_id=AGENT_ID,
            customer_name="Jane Customer",
            customer_phone="254712345678",
            pickup_at=pickup,
            return_at=pickup + timedelta(days=2),
            block_until=pickup + timedelta(days=2, hours=1),
            total_kes=66400,
            pricing_snapshot={"deposit_kes": 20000},
            status=BookingStatus.CONFIRMED,
            hold_expires_at=now + timedelta(minutes=30),
        )
    )
    await db_session.commit()


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


def _breakdown(**overrides) -> dict:
    body = {
        "vehicle_id": str(VEHICLE_ID),
        "booking_id": str(BOOKING_ID),
        "category": "Accident",
        "description": "Broken windscreen",
        "latitude": -1.29,
        "longitude": 36.82,
        "requires_workshop": True,
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_breakdown_auto_blocks_vehicle_and_flags_bookings(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.post(
        "/api/v1/incidents/breakdown", json=_breakdown()
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Open"
    assert data["requires_workshop"] is True
    assert data["location"]["coordinates"] == [36.82, -1.29]
    assert str(BOOKING_ID) in data["affected_booking_ids"]

    vehicle = await db_session.get(Vehicle, VEHICLE_ID)
    await db_session.refresh(vehicle)
    assert vehicle.status == VehicleStatus.MAINTENANCE

    incidents = await api_client.get("/api/v1/incidents?active_only=true")
    assert len(incidents.json()["data"]) == 1

    _login(api_client, OWNER_ID, "owner")
    audit = await api_client.get(
        "/api/v1/audit?action=incident.breakdown"
    )
    assert audit.json()["data"][0]["entity_id"] == data["id"]


@pytest.mark.asyncio
async def test_dispatch_to_partner_mechanic(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")
    created = await api_client.post(
        "/api/v1/incidents/breakdown",
        json=_breakdown(requires_workshop=False),
    )
    incident_id = created.json()["data"]["id"]

    response = await api_client.patch(
        f"/api/v1/incidents/{incident_id}/dispatch",
        json={
            "dispatch_type": "PartnerMechanic",
            "mechanic_id": str(PARTNER_ID),
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Dispatched"
    assert data["dispatch_type"] == "PartnerMechanic"
    assert data["mechanic_name"] == "Partner Garage"

    mechanic = await db_session.get(Mechanic, PARTNER_ID)
    await db_session.refresh(mechanic)
    assert mechanic.is_available is False

    # Unavailable mechanics cannot be dispatched.
    second = await api_client.post(
        "/api/v1/incidents/breakdown",
        json=_breakdown(requires_workshop=False),
    )
    unavailable = await api_client.patch(
        f"/api/v1/incidents/{second.json()['data']['id']}/dispatch",
        json={
            "dispatch_type": "PartnerMechanic",
            "mechanic_id": str(PARTNER_ID),
        },
    )
    assert unavailable.status_code == 409

    in_house = await api_client.patch(
        f"/api/v1/incidents/{second.json()['data']['id']}/dispatch",
        json={"dispatch_type": "InHouseRescue"},
    )
    assert in_house.status_code == 200


@pytest.mark.asyncio
async def test_incident_permissions_and_validation(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    missing_vehicle = await api_client.post(
        "/api/v1/incidents/breakdown",
        json=_breakdown(vehicle_id=str(uuid.uuid4())),
    )
    assert missing_vehicle.status_code == 404

    mismatch = await api_client.post(
        "/api/v1/incidents/breakdown",
        json=_breakdown(booking_id=str(uuid.uuid4())),
    )
    assert mismatch.status_code == 404

    created = await api_client.post(
        "/api/v1/incidents/breakdown", json=_breakdown()
    )
    incident_id = created.json()["data"]["id"]

    _login(api_client, MECHANIC_USER_ID, "mechanic")
    view = await api_client.get("/api/v1/incidents")
    assert view.status_code == 200
    dispatch = await api_client.patch(
        f"/api/v1/incidents/{incident_id}/dispatch",
        json={"dispatch_type": "InHouseRescue"},
    )
    assert dispatch.status_code == 403
