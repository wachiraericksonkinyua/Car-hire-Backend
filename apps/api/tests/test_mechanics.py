import uuid

import pytest

from app.core.security import create_access_token, hash_password
from app.models import Mechanic, User, UserRole

# Central Nairobi, used as the breakdown location in these tests.
NAIROBI_LAT = -1.2921
NAIROBI_LNG = 36.8219
AGENT_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
OWNER_ID = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")


async def _seed(db_session):
    db_session.add_all(
        [
            User(
                id=AGENT_ID,
                email="agent@autohire.co.ke",
                full_name="Test Agent",
                password_hash=hash_password("MySecret123"),
                role=UserRole.AGENT,
            ),
            User(
                id=OWNER_ID,
                email="owner@autohire.co.ke",
                full_name="Test Owner",
                password_hash=hash_password("MySecret123"),
                role=UserRole.OWNER,
            ),
        ]
    )
    db_session.add_all(
        [
            # Very close, but busy with another job.
            Mechanic(
                name="Busy Nairobi Mechanic",
                phone="0700000001",
                county="Nairobi",
                latitude=NAIROBI_LAT,
                longitude=NAIROBI_LNG,
                is_available=False,
            ),
            Mechanic(
                name="Nairobi Mechanic",
                phone="0700000002",
                county="Nairobi",
                latitude=-1.2864,
                longitude=36.8172,
            ),
            Mechanic(
                name="Westlands Mechanic",
                phone="0700000005",
                county="Nairobi",
                latitude=-1.2670,
                longitude=36.8030,
            ),
            Mechanic(
                name="Nyeri Mechanic",
                phone="0700000003",
                county="Nyeri",
                latitude=-0.4169,
                longitude=36.9510,
            ),
            Mechanic(
                name="Nakuru Mechanic",
                phone="0700000004",
                county="Nakuru",
                latitude=-0.3031,
                longitude=36.0800,
            ),
        ]
    )
    await db_session.commit()


def _login_as_agent(client) -> None:
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )


def _login_as_owner(client) -> None:
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(OWNER_ID), 'owner')}"
    )


async def _search(client, limit: int = 5):
    return await client.get(
        "/api/v1/mechanics/nearest",
        params={"lat": NAIROBI_LAT, "lng": NAIROBI_LNG, "limit": limit},
    )


@pytest.mark.asyncio
async def test_nearest_mechanics_are_sorted_by_distance(db_session, api_client):
    await _seed(db_session)
    _login_as_agent(api_client)

    response = await _search(api_client)

    assert response.status_code == 200
    mechanics = response.json()["data"]

    # Unavailable and >50 km mechanics are excluded.
    names = [mechanic["name"] for mechanic in mechanics]
    assert names == ["Nairobi Mechanic", "Westlands Mechanic"]

    distances = [mechanic["distance_km"] for mechanic in mechanics]
    assert distances == sorted(distances)
    assert distances[0] < 5

    # GeoJSON order is [longitude, latitude].
    coords = mechanics[0]["location"]["coordinates"]
    assert coords[0] == 36.8172
    assert coords[1] == -1.2864


@pytest.mark.asyncio
async def test_limit_is_respected(db_session, api_client):
    await _seed(db_session)
    _login_as_agent(api_client)

    response = await _search(api_client, limit=1)

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1


@pytest.mark.asyncio
async def test_coordinates_are_validated(db_session, api_client):
    await _seed(db_session)
    _login_as_agent(api_client)

    response = await api_client.get(
        "/api/v1/mechanics/nearest",
        params={"lat": 200, "lng": NAIROBI_LNG},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_mechanics_filters(db_session, api_client):
    await _seed(db_session)
    _login_as_agent(api_client)

    all_mechanics = await api_client.get("/api/v1/mechanics")
    assert all_mechanics.status_code == 200
    assert len(all_mechanics.json()["data"]) == 5

    nairobi = await api_client.get("/api/v1/mechanics?county=Nairobi")
    names = {item["name"] for item in nairobi.json()["data"]}
    assert names == {
        "Busy Nairobi Mechanic",
        "Nairobi Mechanic",
        "Westlands Mechanic",
    }


@pytest.mark.asyncio
async def test_create_mechanic_requires_manage_permission(db_session, api_client):
    await _seed(db_session)
    body = {
        "name": "New Garage",
        "phone": "0712345678",
        "county": "Nairobi",
        "latitude": -1.3,
        "longitude": 36.8,
        "mechanic_type": "PartnerGarage",
        "specialties": ["Tyres"],
        "call_out_rate_kes": 2000,
    }

    _login_as_agent(api_client)
    forbidden = await api_client.post("/api/v1/mechanics", json=body)
    assert forbidden.status_code == 403

    _login_as_owner(api_client)
    created = await api_client.post("/api/v1/mechanics", json=body)
    assert created.status_code == 200
    data = created.json()["data"]
    assert data["name"] == "New Garage"
    assert data["phone"] == "254712345678"
    assert data["location"]["coordinates"] == [36.8, -1.3]


@pytest.mark.asyncio
async def test_update_mechanic_availability(db_session, api_client):
    await _seed(db_session)
    _login_as_owner(api_client)

    listed = await api_client.get("/api/v1/mechanics?county=Nairobi")
    mechanic_id = listed.json()["data"][0]["id"]

    disabled = await api_client.patch(
        f"/api/v1/mechanics/{mechanic_id}",
        json={"is_available": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["data"]["is_available"] is False

    enabled = await api_client.patch(
        f"/api/v1/mechanics/{mechanic_id}",
        json={"is_available": True},
    )
    assert enabled.json()["data"]["is_available"] is True

    _login_as_agent(api_client)
    forbidden = await api_client.patch(
        f"/api/v1/mechanics/{mechanic_id}",
        json={"is_available": False},
    )
    assert forbidden.status_code == 403
