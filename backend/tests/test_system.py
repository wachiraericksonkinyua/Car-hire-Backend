import uuid

import pytest

from app.core.security import create_access_token, hash_password
from app.models import User, UserRole

OWNER_ID = uuid.UUID("a9000000-0000-0000-0000-000000000001")
AGENT_ID = uuid.UUID("a9000000-0000-0000-0000-000000000002")


async def _seed(db_session):
    db_session.add_all(
        [
            User(
                id=OWNER_ID,
                email="storage-owner@autohire.ke",
                full_name="Storage Owner",
                password_hash=hash_password("MySecret123"),
                role=UserRole.OWNER,
            ),
            User(
                id=AGENT_ID,
                email="storage-agent@autohire.ke",
                full_name="Storage Agent",
                password_hash=hash_password("MySecret123"),
                role=UserRole.AGENT,
            ),
        ]
    )
    await db_session.commit()


def _login(client, user_id, role):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(user_id), role)}"
    )


@pytest.mark.asyncio
async def test_storage_overview_has_database_and_disk_usage(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, OWNER_ID, "owner")

    response = await api_client.get("/api/v1/system/storage")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["database"]["used_bytes"] > 0
    assert data["database"]["quota_bytes"] > 0
    assert "free_bytes" in data["disk"]
    assert isinstance(data["tables"], list)
    assert any(table["name"] == "users" for table in data["tables"])


@pytest.mark.asyncio
async def test_storage_overview_requires_dashboard_permission(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client, AGENT_ID, "agent")

    response = await api_client.get("/api/v1/system/storage")
    assert response.status_code == 200
