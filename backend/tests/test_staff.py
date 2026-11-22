import uuid

import pytest

from app.core.security import create_access_token, hash_password
from app.models import User, UserRole

OWNER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
MANAGER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
AGENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

PASSWORD = "MySecret123"


def _user(user_id, email, role) -> User:
    return User(
        id=user_id,
        email=email,
        full_name=role.value.title(),
        password_hash=hash_password(PASSWORD),
        role=role,
        auth_version=1,
    )


async def _seed(db_session):
    db_session.add_all(
        [
            _user(OWNER_ID, "owner@autohire.ke", UserRole.OWNER),
            _user(MANAGER_ID, "manager@autohire.ke", UserRole.MANAGER),
            _user(AGENT_ID, "agent@autohire.ke", UserRole.AGENT),
        ]
    )
    await db_session.commit()


def _login(client, user_id, role, version=1):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role, version)}"
    )


@pytest.mark.asyncio
async def test_manager_can_create_agent_and_audit_is_written(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, MANAGER_ID, "manager")

    response = await api_client.post(
        "/api/v1/staff",
        json={
            "email": "newagent@autohire.ke",
            "full_name": "New Agent",
            "phone": "0712345678",
            "role": "agent",
            "password": "StrongPass123",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["role"] == "agent"
    assert data["phone"] == "254712345678"
    assert "password_hash" not in data

    _login(api_client, OWNER_ID, "owner")
    audit = await api_client.get("/api/v1/audit?action=staff.create")
    assert audit.status_code == 200
    assert len(audit.json()["data"]) == 1


@pytest.mark.asyncio
async def test_manager_cannot_create_owner(db_session, api_client):
    await _seed(db_session)
    _login(api_client, MANAGER_ID, "manager")

    response = await api_client.post(
        "/api/v1/staff",
        json={
            "email": "secondowner@autohire.ke",
            "full_name": "Second Owner",
            "role": "owner",
            "password": "StrongPass123",
        },
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_cannot_promote_to_owner(db_session, api_client):
    await _seed(db_session)
    _login(api_client, MANAGER_ID, "manager")

    response = await api_client.patch(
        f"/api/v1/staff/{AGENT_ID}/role",
        json={"role": "owner"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_change_own_role(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    response = await api_client.patch(
        f"/api/v1/staff/{OWNER_ID}/role",
        json={"role": "manager"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_role_change_invalidates_target_access_token(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, MANAGER_ID, "manager")

    changed = await api_client.patch(
        f"/api/v1/staff/{AGENT_ID}/role",
        json={"role": "manager"},
    )
    assert changed.status_code == 200

    # The agent's old token carries auth_version 1 and is now rejected.
    _login(api_client, AGENT_ID, "agent", version=1)
    me = await api_client.get("/api/v1/auth/me")
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_deactivation_and_reactivation(db_session, api_client):
    await _seed(db_session)

    # Log in as the agent so a refresh cookie exists.
    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "agent@autohire.ke", "password": PASSWORD},
    )
    assert login.status_code == 200
    agent_access = login.json()["data"]["access_token"]

    _login(api_client, MANAGER_ID, "manager")
    deactivated = await api_client.patch(
        f"/api/v1/staff/{AGENT_ID}/status",
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False

    # Existing access token is invalid and the refresh token is revoked.
    me = await api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {agent_access}"},
    )
    assert me.status_code == 401
    refresh = await api_client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 401

    _login(api_client, MANAGER_ID, "manager")
    reactivated = await api_client.patch(
        f"/api/v1/staff/{AGENT_ID}/status",
        json={"is_active": True},
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["data"]["is_active"] is True


@pytest.mark.asyncio
async def test_agent_cannot_list_staff(db_session, api_client):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.get("/api/v1/staff")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_staff_photo_upload_and_remove(db_session, api_client):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    uploaded = await api_client.post(
        f"/api/v1/staff/{AGENT_ID}/photo",
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert uploaded.status_code == 200
    photo_url = uploaded.json()["data"]["avatar_url"]
    assert photo_url == f"/public/profile-photos/users/{AGENT_ID}"
    photo = await api_client.get(f"/api/v1{photo_url}")
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/png"
    assert photo.content == b"\x89PNG\r\n\x1a\n"

    removed = await api_client.delete(
        f"/api/v1/staff/{AGENT_ID}/photo"
    )
    assert removed.status_code == 200
    assert removed.json()["data"]["avatar_url"] is None
    missing_photo = await api_client.get(f"/api/v1{photo_url}")
    assert missing_photo.status_code == 404

    _login(api_client, MANAGER_ID, "manager")
    forbidden = await api_client.post(
        f"/api/v1/staff/{OWNER_ID}/photo",
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert forbidden.status_code == 403
