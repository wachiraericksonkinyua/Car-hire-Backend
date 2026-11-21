import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app


class _HealthyDB:
    """Stand-in session whose SELECT succeeds."""

    async def execute(self, *_args, **_kwargs):
        return None


class _BrokenDB:
    """Stand-in session that simulates PostgreSQL being unavailable."""

    async def execute(self, *_args, **_kwargs):
        raise RuntimeError("database is down")


@pytest.fixture
def client():
    async def healthy_db():
        yield _HealthyDB()

    app.dependency_overrides[get_db] = healthy_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_check_returns_200(client):
    response = client.get("/health")

    assert response.status_code == 200


def test_health_check_says_healthy(client):
    response = client.get("/health")

    assert response.json() == {
        "success": True,
        "data": {"status": "healthy", "database": "connected"},
        "error": None,
    }


def test_health_check_returns_503_when_database_is_down():
    async def broken_db():
        yield _BrokenDB()

    app.dependency_overrides[get_db] = broken_db
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    body = response.json()
    assert response.status_code == 503
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "service_unavailable"
    assert body["error"]["request_id"]
