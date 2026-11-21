import pytest

from app.core.security import hash_password
from app.models import User, UserRole

EMAIL = "owner@autohire.ke"
PASSWORD = "MySecret123"


async def _seed_user(db_session, *, is_active=True, auth_version=1):
    user = User(
        email=EMAIL,
        full_name="Test Owner",
        password_hash=hash_password(PASSWORD),
        role=UserRole.OWNER,
        is_active=is_active,
        auth_version=auth_version,
    )
    db_session.add(user)
    await db_session.commit()
    return user


async def _login(client) -> dict:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["data"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_login_returns_memory_access_token_and_refresh_cookie(
    db_session, api_client
):
    await _seed_user(db_session)

    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900
    assert data["user"]["email"] == EMAIL
    assert data["user"]["role"] == "owner"
    assert "password_hash" not in data["user"]

    # Access token is not stored in a cookie; refresh token is.
    assert api_client.cookies.get("access_token") is None
    assert api_client.cookies.get("refresh_token") is not None
    set_cookie = response.headers["set-cookie"]
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie


@pytest.mark.asyncio
async def test_me_uses_bearer_token(db_session, api_client):
    await _seed_user(db_session)
    data = await _login(api_client)

    response = await api_client.get(
        "/api/v1/auth/me",
        headers=_auth(data["access_token"]),
    )

    assert response.status_code == 200
    assert response.json()["data"]["email"] == EMAIL


@pytest.mark.asyncio
async def test_login_with_wrong_password_returns_401(db_session, api_client):
    await _seed_user(db_session)

    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": "WrongPassword"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limit_returns_429(db_session, api_client):
    await _seed_user(db_session)

    for _ in range(5):
        response = await api_client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL, "password": "WrongPassword"},
        )
        assert response.status_code == 401

    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": "WrongPassword"},
    )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_refresh_rotates_and_old_token_is_rejected(
    db_session, api_client
):
    await _seed_user(db_session)
    await _login(api_client)
    old_refresh = api_client.cookies.get("refresh_token")

    refreshed = await api_client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["data"]["access_token"]
    new_refresh = api_client.cookies.get("refresh_token")
    assert new_refresh != old_refresh

    # Reusing the rotated token must fail.
    api_client.cookies.clear()
    api_client.cookies.set("refresh_token", old_refresh)
    reused = await api_client.post("/api/v1/auth/refresh")
    assert reused.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(db_session, api_client):
    await _seed_user(db_session)
    await _login(api_client)

    logout = await api_client.post("/api/v1/auth/logout")
    assert logout.status_code == 200

    refreshed = await api_client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 401


@pytest.mark.asyncio
async def test_deactivated_user_is_rejected_on_next_request(
    db_session, api_client
):
    user = await _seed_user(db_session)
    data = await _login(api_client)

    user.is_active = False
    await db_session.commit()

    response = await api_client.get(
        "/api/v1/auth/me",
        headers=_auth(data["access_token"]),
    )

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "Account is inactive"


@pytest.mark.asyncio
async def test_role_change_invalidates_existing_access_token(
    db_session, api_client
):
    user = await _seed_user(db_session)
    data = await _login(api_client)

    user.auth_version += 1
    await db_session.commit()

    response = await api_client.get(
        "/api/v1/auth/me",
        headers=_auth(data["access_token"]),
    )

    assert response.status_code == 401
