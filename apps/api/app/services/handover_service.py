"""Handover settlement calculations shared by check-in and preview."""

from datetime import datetime, timedelta
from math import ceil

from app.core.config import get_settings
from app.models.booking import Booking
from app.models.vehicle import Vehicle
from app.utils.time import as_utc


def calculate_settlement(
    booking: Booking,
    vehicle: Vehicle,
    *,
    checkout_odometer_km: int,
    odometer_km: int,
    now: datetime,
) -> dict:
    settings = get_settings()
    grace_end = as_utc(booking.return_at) + timedelta(
        minutes=settings.LATE_FEE_GRACE_MINUTES
    )
    late_hours = (
        ceil((now - grace_end).total_seconds() / 3600)
        if now > grace_end
        else 0
    )
    late_fee_kes = late_hours * settings.LATE_FEE_PER_HOUR_KES

    distance_km = odometer_km - checkout_odometer_km
    excess_km = max(0, distance_km - vehicle.mileage_cap_km)
    excess_mileage_kes = excess_km * settings.EXCESS_MILEAGE_KES_PER_KM

    return {
        "grace_hours": settings.LATE_FEE_GRACE_MINUTES / 60,
        "late_hours": late_hours,
        "late_fee_kes": late_fee_kes,
        "distance_km": distance_km,
        "included_mileage_km": vehicle.mileage_cap_km,
        "excess_km": excess_km,
        "excess_mileage_rate_kes": settings.EXCESS_MILEAGE_KES_PER_KM,
        "excess_mileage_kes": excess_mileage_kes,
        "total_charges_kes": late_fee_kes + excess_mileage_kes,
    }
