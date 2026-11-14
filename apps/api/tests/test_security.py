from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.deps import require_role
from app.core.security import (
    create_access_token,
    decrypt_pii,
    encrypt_pii,
    hash_password,
    verify_password,
)

app = FastAPI()


# A tiny stand-in for a real protected route.
@app.get("/admin-only")
def admin_only(payload: dict = Depends(require_role("admin", "manager"))):
    return {"role": payload["role"]}


def test_password_hashing_and_verification():
    hashed = hash_password("MySecret123")

    assert hashed != "MySecret123"
    assert verify_password("MySecret123", hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_pii_encryption_round_trip():
    national_id = "34567890"

    encrypted = encrypt_pii(national_id)

    assert encrypted != national_id
    assert decrypt_pii(encrypted) == national_id


def test_driver_cookie_gets_403():
    token = create_access_token(user_id="1", role="driver")
    client = TestClient(app)
    client.cookies.set("access_token", token)

    response = client.get("/admin-only")

    assert response.status_code == 403


def test_admin_cookie_gets_200():
    token = create_access_token(user_id="2", role="admin")
    client = TestClient(app)
    client.cookies.set("access_token", token)

    response = client.get("/admin-only")

    assert response.status_code == 200
    assert response.json() == {"role": "admin"}


def test_missing_cookie_gets_401():
    client = TestClient(app)

    response = client.get("/admin-only")

    assert response.status_code == 401
