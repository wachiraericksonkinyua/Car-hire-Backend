from fastapi.testclient import TestClient

from app.main import app

# TestClient wraps our FastAPI app and lets us make requests to it in tests,
# without needing to run a real server with uvicorn.
client = TestClient(app)


def test_health_check_returns_200():
    # Simulate a GET request to the /health endpoint.
    response = client.get("/health")

    # The endpoint should answer successfully.
    assert response.status_code == 200


def test_health_check_says_healthy():
    response = client.get("/health")

    # json() turns the response body into a Python dictionary.
    assert response.json()["status"] == "healthy"
