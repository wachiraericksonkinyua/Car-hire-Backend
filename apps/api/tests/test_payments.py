import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.core.security import create_access_token
from sqlalchemy import func, select

from app.models import (
    AuditLog,
    Booking,
    BookingStatus,
    Payment,
    PaymentStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.services import payment_service

AGENT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
VEHICLE_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
BOOKING_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")


async def _seed(db_session):
    db_session.add_all(
        [
            User(
                id=AGENT_ID,
                email="agent@autohire.co.ke",
                full_name="Test Agent",
                password_hash="hashed-secret",
                role=UserRole.AGENT,
            ),
            Vehicle(
                id=VEHICLE_ID,
                plate_number="KCA 123A",
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
                insurance_expiry=date(2027, 1, 1),
            ),
            Booking(
                id=BOOKING_ID,
                reference="BK-2612-0001",
                vehicle_id=VEHICLE_ID,
                created_by_id=AGENT_ID,
                customer_name="Jane Customer",
                customer_phone="254712345678",
                pickup_at=datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc),
                return_at=datetime(2026, 12, 5, 9, 0, tzinfo=timezone.utc),
                block_until=datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc),
                total_kes=60000,
                status=BookingStatus.RESERVED,
                hold_expires_at=(
                    datetime.now(timezone.utc) + timedelta(minutes=30)
                ),
            ),
        ]
    )
    await db_session.commit()


@pytest.fixture
def fake_stk_push(monkeypatch):
    calls = []

    async def _fake(phone: str, amount: int, booking_id: uuid.UUID) -> dict:
        calls.append({"phone": phone, "amount": amount})
        return {
            "CheckoutRequestID": "ws_CO_TEST_123",
            "CustomerMessage": "Success. Request accepted for processing",
        }

    monkeypatch.setattr(payment_service, "_send_stk_push", _fake)
    return calls


def _stk_payload() -> dict:
    return {
        "phone_number": "0712345678",
        "booking_id": str(BOOKING_ID),
    }


def _callback_payload(
    *,
    checkout_id="ws_CO_TEST_123",
    amount=60000,
    receipt="QK123ABC",
    result_code=0,
) -> dict:
    data = {
        "MerchantRequestID": "merchant-1",
        "CheckoutRequestID": checkout_id,
        "ResultCode": result_code,
        "ResultDesc": "The service request is processed successfully.",
    }
    if result_code == 0:
        data["CallbackMetadata"] = {
            "Item": [
                {"Name": "Amount", "Value": amount},
                {"Name": "MpesaReceiptNumber", "Value": receipt},
                {"Name": "PhoneNumber", "Value": 254712345678},
            ]
        }
    return {"Body": {"stkCallback": data}}


@pytest.mark.asyncio
async def test_stk_push_initiation(db_session, api_client, fake_stk_push):
    await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )

    response = await api_client.post(
        "/api/v1/payments/stk-push",
        json={**_stk_payload(), "amount": 1},  # client amount must be ignored
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["checkout_request_id"] == "ws_CO_TEST_123"
    assert data["status"] == "Pending"
    assert fake_stk_push == [
        {"phone": "254712345678", "amount": 60000}
    ]


@pytest.mark.asyncio
async def test_stk_permissions_and_unknown_booking(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)

    no_auth = await api_client.post(
        "/api/v1/payments/stk-push", json=_stk_payload()
    )
    assert no_auth.status_code == 401

    mechanic_id = uuid.uuid4()
    db_session.add(
        User(
            id=mechanic_id,
            email="mechanic@autohire.ke",
            full_name="Mechanic",
            password_hash="hashed-secret",
            role=UserRole.MECHANIC,
        )
    )
    await db_session.commit()
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(mechanic_id), 'mechanic')}"
    )
    forbidden = await api_client.post(
        "/api/v1/payments/stk-push", json=_stk_payload()
    )
    assert forbidden.status_code == 403

    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )
    missing = await api_client.post(
        "/api/v1/payments/stk-push",
        json={**_stk_payload(), "booking_id": str(uuid.uuid4())},
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_stk_rejects_non_reserved_and_expired_hold(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )

    booking = await db_session.get(Booking, BOOKING_ID)
    booking.status = BookingStatus.CONFIRMED
    await db_session.commit()

    confirmed = await api_client.post(
        "/api/v1/payments/stk-push", json=_stk_payload()
    )
    assert confirmed.status_code == 409

    booking.status = BookingStatus.RESERVED
    booking.hold_expires_at = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    )
    await db_session.commit()

    expired = await api_client.post(
        "/api/v1/payments/stk-push", json=_stk_payload()
    )
    assert expired.status_code == 409


@pytest.mark.asyncio
async def test_payment_status_unknown_returns_404(db_session, api_client):
    await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )

    response = await api_client.get("/api/v1/payments/does-not-exist")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_successful_webhook_fulfils_booking(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)
    api_client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )

    stk = await api_client.post(
        "/api/v1/payments/stk-push",
        json=_stk_payload(),
    )
    assert stk.status_code == 200

    response = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Completed"
    assert data["mpesa_receipt"] == "QK123ABC"

    status_response = await api_client.get(
        "/api/v1/payments/ws_CO_TEST_123"
    )
    assert status_response.status_code == 200
    status_data = status_response.json()["data"]
    assert status_data["status"] == "Completed"
    assert status_data["amount_due_kes"] == 60000
    assert status_data["phone_masked"] == "2547 XXX 678"
    assert status_data["refund_required"] is False


def _login_agent(client) -> None:
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )


async def _add_pending_payment(
    db_session,
    *,
    checkout_id="ws_CO_LATE",
    booking_id=BOOKING_ID,
    amount=60000,
) -> Payment:
    payment = Payment(
        booking_id=booking_id,
        amount_kes=amount,
        amount_due_kes=amount,
        phone="254712345678",
        checkout_request_id=checkout_id,
        status=PaymentStatus.PENDING,
    )
    db_session.add(payment)
    await db_session.commit()
    return payment


@pytest.mark.asyncio
async def test_callback_is_idempotent(db_session, api_client, fake_stk_push):
    await _seed(db_session)
    _login_agent(api_client)
    await api_client.post("/api/v1/payments/stk-push", json=_stk_payload())

    first = await api_client.post(
        "/api/v1/payments/mpesa/callback", json=_callback_payload()
    )
    second = await api_client.post(
        "/api/v1/payments/mpesa/callback", json=_callback_payload()
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["status"] == "Completed"

    booking = await db_session.get(Booking, BOOKING_ID)
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED

    count = await db_session.scalar(
        select(func.count())
        .select_from(AuditLog)
        .where(AuditLog.action == "booking.confirm")
    )
    assert count == 1


@pytest.mark.asyncio
async def test_amount_mismatch_does_not_confirm(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)
    _login_agent(api_client)
    await api_client.post("/api/v1/payments/stk-push", json=_stk_payload())

    response = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(amount=100),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Mismatched"
    assert data["amount_mismatch"] is True

    booking = await db_session.get(Booking, BOOKING_ID)
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.RESERVED


@pytest.mark.asyncio
async def test_duplicate_receipt_is_rejected(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)
    _login_agent(api_client)
    await api_client.post("/api/v1/payments/stk-push", json=_stk_payload())
    await api_client.post(
        "/api/v1/payments/mpesa/callback", json=_callback_payload()
    )

    await _add_pending_payment(
        db_session, checkout_id="ws_CO_TEST_456"
    )
    duplicate = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(checkout_id="ws_CO_TEST_456"),
    )

    assert duplicate.status_code == 409


@pytest.mark.asyncio
async def test_late_payment_confirms_when_vehicle_is_free(
    db_session, api_client
):
    await _seed(db_session)
    booking = await db_session.get(Booking, BOOKING_ID)
    booking.status = BookingStatus.EXPIRED
    booking.hold_expires_at = (
        datetime.now(timezone.utc) - timedelta(minutes=5)
    )
    await db_session.commit()
    await _add_pending_payment(db_session)
    _login_agent(api_client)

    response = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(checkout_id="ws_CO_LATE"),
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "Completed"
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED


@pytest.mark.asyncio
async def test_late_payment_flags_refund_when_vehicle_taken(
    db_session, api_client
):
    await _seed(db_session)
    booking = await db_session.get(Booking, BOOKING_ID)
    booking.status = BookingStatus.EXPIRED
    booking.hold_expires_at = (
        datetime.now(timezone.utc) - timedelta(minutes=5)
    )
    await db_session.commit()

    # Another blocking booking now occupies the same vehicle/dates.
    conflicting = Booking(
        reference="BK-2612-0999",
        vehicle_id=VEHICLE_ID,
        created_by_id=AGENT_ID,
        customer_name="Other Customer",
        customer_phone="254712345679",
        pickup_at=booking.pickup_at,
        return_at=booking.return_at,
        block_until=booking.block_until,
        total_kes=66400,
        status=BookingStatus.RESERVED,
        hold_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db_session.add(conflicting)
    await db_session.commit()

    await _add_pending_payment(db_session)
    _login_agent(api_client)

    response = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(checkout_id="ws_CO_LATE"),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "Completed"
    assert data["refund_required"] is True
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.EXPIRED


@pytest.mark.asyncio
async def test_failed_callback_marks_payment_failed(
    db_session, api_client, fake_stk_push
):
    await _seed(db_session)
    _login_agent(api_client)
    await api_client.post("/api/v1/payments/stk-push", json=_stk_payload())

    response = await api_client.post(
        "/api/v1/payments/mpesa/callback",
        json=_callback_payload(result_code=1032),
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "Failed"
    booking = await db_session.get(Booking, BOOKING_ID)
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.RESERVED
