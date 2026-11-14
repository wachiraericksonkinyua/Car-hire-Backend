import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import User, UserRole

EMAIL = "agent@autohire.co.ke"
PASSWORD = "MySecret123"


@pytest_asyncio.fixture
async def client():
    # One shared in-memory SQLite database for the duration of the test.
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    session = maker()

    # Seed one active admin user with a real Argon2 hash.
    session.add(
        User(
            email=EMAIL,
            full_name="Test Agent",
            password_hash=hash_password(PASSWORD),
            role=UserRole.ADMIN,
        )
    )
    await session.commit()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    # https base URL so the Secure cookie is stored and sent back.
    test_client = TestClient(app, base_url="https://testserver")
    yield test_client

    app.dependency_overrides.clear()
    await session.close()
    await engine.dispose()


def test_login_sets_cookie_and_returns_user(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL
    assert response.json()["role"] == "admin"
    assert "password_hash" not in response.json()

    cookie = response.cookies.get("access_token")
    assert cookie is not None
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]


def test_login_with_wrong_password_returns_401(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": "WrongPassword"},
    )

    assert response.status_code == 401


def test_me_with_valid_cookie_returns_user(client):
    client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL
    assert response.json()["full_name"] == "Test Agent"
