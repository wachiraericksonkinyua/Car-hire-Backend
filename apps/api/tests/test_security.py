from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from app.api.deps import get_current_user_payload, require_role
from app.core.security import (
    decrypt_pii,
    encrypt_pii,
    hash_password,
    verify_password,
)

app = FastAPI()


# Decouple the role test from the real token/DB dependency.
def _role_from_header(request: Request) -> dict:
    return {"role": request.headers.get("X-Test-Role", "driver"), "sub": "1"}


app.dependency_overrides[get_current_user_payload] = _role_from_header


# A tiny stand-in for a real protected route.
@app.get("/admin-only")
def admin_only(payload: dict = Depends(require_role("owner", "manager"))):
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


def test_driver_role_gets_403():
    response = TestClient(app).get(
        "/admin-only", headers={"X-Test-Role": "driver"}
    )

    assert response.status_code == 403


def test_owner_role_gets_200():
    response = TestClient(app).get(
        "/admin-only", headers={"X-Test-Role": "owner"}
    )

    assert response.status_code == 200
    assert response.json() == {"role": "owner"}
