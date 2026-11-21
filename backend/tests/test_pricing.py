import uuid
from datetime import date, datetime, timezone

import pytest

from app.core.security import create_access_token, hash_password
from app.models import User, UserRole, Vehicle, VehicleStatus
from app.services.pricing_service import (
    InvalidRentalPeriodError,
    calculate_quote,
    rental_days,
)

AGENT_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
VEHICLE_ID = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")


def _vehicle(daily_rate=10000, deposit=20000) -> Vehicle:
    return Vehicle(
        id=VEHICLE_ID,
        plate_number="KCA 123A",
        brand="Toyota",
        model="Landcruiser",
        year=2022,
        daily_rate_kes=daily_rate,
        deposit_kes=deposit,
        status=VehicleStatus.AVAILABLE,
        category="SUV",
        transmission="Automatic",
        fuel="Diesel",
        seats=5,
        bags=3,
        mileage_cap_km=300,
        insurance_expiry=date(2027, 1, 1),
    )


def _pickup():
    return datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc)


def _return(days=4):
    return datetime(2026, 12, 1 + days, 9, 0, tzinfo=timezone.utc)


def _quote(**kwargs):
    defaults = dict(
        pickup_at=_pickup(),
        return_at=_return(),
        with_chauffeur=False,
        chauffeur_zone=None,
        extras=(),
    )
    defaults.update(kwargs)
    return calculate_quote(_vehicle(), **defaults)


def test_rental_days_rounds_up_and_has_a_minimum():
    assert rental_days(_pickup(), _pickup().replace(hour=12)) == 1
    assert rental_days(_pickup(), _return(1)) == 1
    assert rental_days(_pickup(), _return(2)) == 2


def test_invalid_period_is_rejected():
    with pytest.raises(InvalidRentalPeriodError):
        rental_days(_return(), _pickup())


def test_base_rental_vat_and_untaxed_deposit():
    quote = _quote()

    assert quote.days == 4
    assert quote.base_rental_kes == 40000
    assert quote.chauffeur_fee_kes == 0
    assert quote.taxable_subtotal_kes == 40000
    assert quote.vat_percent == 16
    assert quote.vat_kes == 6400
    assert quote.deposit_kes == 20000
    assert quote.total_due_kes == 66400

    # Deposit must not be part of the VAT base.
    assert quote.vat_kes == (quote.taxable_subtotal_kes * 16 + 50) // 100


def test_chauffeur_in_town_and_upcountry():
    in_town = _quote(with_chauffeur=True)
    assert in_town.chauffeur_zone == "in_town"
    assert in_town.chauffeur_rate_kes == 2500
    assert in_town.chauffeur_fee_kes == 10000
    assert in_town.vat_kes == 8000
    # Chauffeur deposit is 50% of the vehicle deposit (20,000 -> 10,000).
    assert in_town.deposit_kes == 10000
    assert in_town.total_due_kes == 68000

    upcountry = _quote(with_chauffeur=True, chauffeur_zone="upcountry")
    assert upcountry.chauffeur_rate_kes == 4000
    assert upcountry.chauffeur_fee_kes == 16000
    assert upcountry.vat_kes == 8960
    assert upcountry.deposit_kes == 10000
    assert upcountry.total_due_kes == 74960


def test_extras_are_per_day_or_flat_and_deduped():
    quote = _quote(
        extras=[
            "baby_seat",
            "baby_seat",  # duplicate is ignored
            "rooftop_tent",
            "cooler_box",
            "airport_pickup",
        ]
    )

    by_code = {line.code: line for line in quote.extras}
    assert len(quote.extras) == 4
    assert by_code["baby_seat"].amount_kes == 2000
    assert by_code["rooftop_tent"].amount_kes == 10000
    assert by_code["cooler_box"].amount_kes == 1200
    assert by_code["airport_pickup"].quantity == 1
    assert by_code["airport_pickup"].amount_kes == 1500

    assert quote.taxable_subtotal_kes == 40000 + 14700
    assert quote.vat_kes == 8752
    assert quote.total_due_kes == 83452


def test_vat_rounds_half_up_with_integers():
    quote = calculate_quote(
        _vehicle(daily_rate=10004, deposit=0),
        pickup_at=_pickup(),
        return_at=_return(1),
    )

    assert quote.taxable_subtotal_kes == 10004
    assert quote.vat_kes == 1601
    assert quote.total_due_kes == 11605


async def _seed(db_session):
    db_session.add(
        User(
            id=AGENT_ID,
            email="agent@autohire.co.ke",
            full_name="Test Agent",
            password_hash=hash_password("MySecret123"),
            role=UserRole.AGENT,
        )
    )
    db_session.add(_vehicle())
    await db_session.commit()


def _login(client):
    client.headers["Authorization"] = (
        f"Bearer {create_access_token(str(AGENT_ID), 'agent')}"
    )


@pytest.mark.asyncio
async def test_quote_endpoint_returns_breakdown_and_writes_nothing(
    db_session, api_client
):
    await _seed(db_session)
    _login(api_client)

    response = await api_client.post(
        "/api/v1/quotes/calculate",
        json={
            "vehicle_id": str(VEHICLE_ID),
            "pickup_at": "2026-12-01T09:00:00Z",
            "return_at": "2026-12-05T09:00:00Z",
            "with_chauffeur": True,
            "chauffeur_zone": "in_town",
            "extras": ["baby_seat", "airport_pickup"],
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["base_rental_kes"] == 40000
    assert data["chauffeur_fee_kes"] == 10000
    assert data["taxable_subtotal_kes"] == 53500
    assert data["vat_kes"] == 8560
    assert data["deposit_kes"] == 10000
    assert data["total_due_kes"] == 72060

    # The quote endpoint performs no writes.
    from sqlalchemy import text

    count = await db_session.scalar(text("SELECT count(*) FROM bookings"))
    assert count == 0


@pytest.mark.asyncio
async def test_quote_endpoint_404_and_422(db_session, api_client):
    await _seed(db_session)
    _login(api_client)

    missing = await api_client.post(
        "/api/v1/quotes/calculate",
        json={
            "vehicle_id": str(uuid.uuid4()),
            "pickup_at": "2026-12-01T09:00:00Z",
            "return_at": "2026-12-05T09:00:00Z",
        },
    )
    assert missing.status_code == 404

    bad_period = await api_client.post(
        "/api/v1/quotes/calculate",
        json={
            "vehicle_id": str(VEHICLE_ID),
            "pickup_at": "2026-12-05T09:00:00Z",
            "return_at": "2026-12-01T09:00:00Z",
        },
    )
    assert bad_period.status_code == 422
