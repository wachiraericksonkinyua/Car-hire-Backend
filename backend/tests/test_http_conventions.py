import uuid

import pytest

from app.core.security import create_access_token, hash_password
from app.models import User, UserRole

AGENT_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")


async def _seed_agent(db_session) -> None:
    db_session.add(
        User(
            id=AGENT_ID,
            email="agent@autohire.co.ke",
            full_name="Test Agent",
            password_hash=hash_password("MySecret123"),
            role=UserRole.AGENT,
        )
    )
    await db_session.commit()


def _login_as_agent(client) -> None:
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )


@pytest.mark.asyncio
async def test_success_envelope(db_session, api_client):
    await _seed_agent(db_session)
    _login_as_agent(api_client)
    response = await api_client.get("/api/v1/vehicles")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"items": [], "total": 0, "limit": 20, "offset": 0},
        "error": None,
    }


@pytest.mark.asyncio
async def test_401_error_envelope_has_request_id(api_client):
    response = await api_client.post(
        "/api/v1/bookings",
        json={
            "vehicle_id": "11111111-1111-1111-1111-111111111111",
            "pickup_at": "2026-12-01T09:00:00Z",
            "return_at": "2026-12-05T09:00:00Z",
            "customer_name": "Jane Customer",
            "customer_phone": "0712345678",
            "with_chauffeur": False,
        },
    )

    body = response.json()
    assert response.status_code == 401
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["request_id"]
    assert response.headers["X-Request-ID"] == body["error"]["request_id"]


@pytest.mark.asyncio
async def test_404_error_envelope(api_client):
    response = await api_client.get("/api/v1/does-not-exist")

    body = response.json()
    assert response.status_code == 404
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]


@pytest.mark.asyncio
async def test_422_error_envelope_for_validation(api_client):
    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": "x"},
    )

    body = response.json()
    assert response.status_code == 422
    assert body["error"]["code"] == "validation_error"
    assert isinstance(body["error"]["details"], list)
    assert body["error"]["request_id"]


@pytest.mark.asyncio
async def test_405_error_envelope(api_client):
    response = await api_client.delete("/api/v1/vehicles")

    body = response.json()
    assert response.status_code == 405
    assert body["error"]["code"] == "method_not_allowed"


@pytest.mark.asyncio
async def test_inbound_request_id_is_echoed(db_session, api_client):
    await _seed_agent(db_session)
    _login_as_agent(api_client)
    response = await api_client.get(
        "/api/v1/vehicles",
        headers={"X-Request-ID": "client-request-123"},
    )

    assert response.headers["X-Request-ID"] == "client-request-123"
