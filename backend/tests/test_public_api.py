import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models import Mechanic, Vehicle, VehicleStatus
from app.services import payment_service

VEHICLE_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
MECHANIC_ID = uuid.UUID("20000000-0000-0000-0000-000000000001")


async def _seed(db_session):
    db_session.add(
        Vehicle(
            id=VEHICLE_ID,
            plate_number="KAA 001A",
            brand="Toyota",
            model="Landcruiser",
            year=2022,
            daily_rate_kes=10000,
            deposit_kes=20000,
            status=VehicleStatus.AVAILABLE,
            category="SUV",
            transmission="Automatic",
            fuel="Diesel",
            seats=5,
            bags=3,
            mileage_cap_km=300,
            insurance_expiry=date(2030, 1, 1),
        )
    )
    db_session.add(
        Mechanic(
            id=MECHANIC_ID,
            name="Public Mechanic",
            phone="254712345678",
            county="Nairobi",
            latitude=-1.2864,
            longitude=36.8172,
            is_available=True,
        )
    )
    await db_session.commit()


def _dates(days=2, nights=2):
    pickup = datetime.now(timezone.utc) + timedelta(days=days)
    return pickup, pickup + timedelta(days=nights)


def _booking_payload(pickup, return_at):
    return {
        "vehicle_id": str(VEHICLE_ID),
        "pickup_at": pickup.isoformat(),
        "return_at": return_at.isoformat(),
        "customer_name": "Jane Customer",
        "customer_phone": "0712345678",
        "customer_email": "jane@example.com",
        "pickup_location": "JKIA",
        "with_chauffeur": False,
    }


@pytest.mark.asyncio
async def test_public_catalogue_quote_and_booking_lookup(db_session, api_client):
    await _seed(db_session)

    vehicles = await api_client.get("/api/v1/public/vehicles")
    assert vehicles.status_code == 200
    assert vehicles.json()["data"]["total"] == 1

    detail = await api_client.get(f"/api/v1/public/vehicles/{VEHICLE_ID}")
    assert detail.status_code == 200
    assert detail.json()["data"]["plate_number"] == "KAA 001A"

    pickup, return_at = _dates()
    quote = await api_client.post(
        "/api/v1/public/quotes/calculate",
        json={
            "vehicle_id": str(VEHICLE_ID),
            "pickup_at": pickup.isoformat(),
            "return_at": return_at.isoformat(),
            "extras": ["baby_seat"],
        },
    )
    assert quote.status_code == 200
    assert quote.json()["data"]["total_due_kes"] > 0

    created = await api_client.post(
        "/api/v1/public/bookings",
        json=_booking_payload(pickup, return_at),
    )
    assert created.status_code == 200
    data = created.json()["data"]
    assert data["status"] == "Reserved"
    reference = data["reference"]

    lookup = await api_client.get(
        f"/api/v1/public/bookings/{reference}",
        params={"phone": "0712345678"},
    )
    assert lookup.status_code == 200
    assert lookup.json()["data"]["reference"] == reference
    assert lookup.json()["data"]["payment_status"] is None

    wrong_phone = await api_client.get(
        f"/api/v1/public/bookings/{reference}",
        params={"phone": "0722000000"},
    )
    assert wrong_phone.status_code == 404


@pytest.mark.asyncio
async def test_public_stk_and_payment_polling(
    db_session, api_client, monkeypatch
):
    await _seed(db_session, )
    pickup, return_at = _dates()

    async def fake_stk(phone, amount, booking_id):
        return {"CheckoutRequestID": "ws_CO_PUBLIC", "CustomerMessage": "ok"}

    monkeypatch.setattr(payment_service, "_send_stk_push", fake_stk)

    created = await api_client.post(
        "/api/v1/public/bookings",
        json=_booking_payload(pickup, return_at),
    )
    reference = created.json()["data"]["reference"]

    stk = await api_client.post(
        "/api/v1/public/payments/stk-push",
        json={"reference": reference, "phone_number": "0712345678"},
    )
    assert stk.status_code == 200
    assert stk.json()["data"]["checkout_request_id"] == "ws_CO_PUBLIC"

    payment = await api_client.get(
        "/api/v1/public/payments/ws_CO_PUBLIC",
        params={"reference": reference, "phone": "0712345678"},
    )
    assert payment.status_code == 200
    assert payment.json()["data"]["status"] == "Pending"
    assert payment.json()["data"]["phone_masked"] == "2547 XXX 678"


@pytest.mark.asyncio
async def test_public_mechanics_are_public(db_session, api_client):
    await _seed(db_session)

    response = await api_client.get(
        "/api/v1/public/mechanics/nearest",
        params={"lat": -1.2921, "lng": 36.8219},
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["name"] == "Public Mechanic"
    assert response.json()["data"][0]["location"]["coordinates"] == [
        36.8172,
        -1.2864,
    ]
