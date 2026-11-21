"""Pure pricing service used by quotes and booking creation.

Rules:
- All amounts are whole KES (integers); no floats.
- Rental days are rounded up, minimum one day.
- VAT applies to base rental + chauffeur + taxable extras.
- The refundable security deposit (from the vehicle) is untaxed and shown
  separately, but included in the total due.
"""

from datetime import datetime
from math import ceil
from typing import Iterable

from app.core.config import get_settings
from app.models.vehicle import Vehicle
from app.schemas.quote import (
    ChauffeurZone,
    ExtraCode,
    QuoteExtraLine,
    QuoteResponse,
)

# Label and whether each extra is charged per rental day.
_EXTRA_DEFINITIONS: dict[str, tuple[str, bool]] = {
    "baby_seat": ("Baby seat", True),
    "rooftop_tent": ("Rooftop tent", True),
    "cooler_box": ("Cooler box", True),
    "airport_pickup": ("Airport pickup", False),
}


class InvalidRentalPeriodError(ValueError):
    """Raised when return_at is not after pickup_at."""


def rental_days(pickup_at: datetime, return_at: datetime) -> int:
    duration = return_at - pickup_at
    if duration.total_seconds() <= 0:
        raise InvalidRentalPeriodError("return_at must be after pickup_at")
    return max(1, ceil(duration.total_seconds() / 86400))


def _vat(taxable_kes: int, percent: int) -> int:
    """Integer VAT, rounded half-up."""
    return (taxable_kes * percent + 50) // 100


def _extra_rate(code: ExtraCode) -> int:
    settings = get_settings()
    return {
        "baby_seat": settings.BABY_SEAT_KES_PER_DAY,
        "rooftop_tent": settings.ROOFTOP_TENT_KES_PER_DAY,
        "cooler_box": settings.COOLER_BOX_KES_PER_DAY,
        "airport_pickup": settings.AIRPORT_PICKUP_KES,
    }[code]


def calculate_quote(
    vehicle: Vehicle,
    *,
    pickup_at: datetime,
    return_at: datetime,
    with_chauffeur: bool = False,
    chauffeur_zone: ChauffeurZone | None = None,
    extras: Iterable[ExtraCode] = (),
) -> QuoteResponse:
    """Calculate an itemised quote. This function never touches the database."""
    settings = get_settings()
    days = rental_days(pickup_at, return_at)

    base_rental_kes = days * vehicle.daily_rate_kes

    if with_chauffeur:
        zone = chauffeur_zone or "in_town"
        rate = (
            settings.DRIVER_FEE_UPCOUNTRY_KES_PER_DAY
            if zone == "upcountry"
            else settings.DRIVER_FEE_IN_TOWN_KES_PER_DAY
        )
        chauffeur_days = days
        chauffeur_fee_kes = days * rate
    else:
        zone = None
        chauffeur_days = 0
        rate = 0
        chauffeur_fee_kes = 0

    extra_lines: list[QuoteExtraLine] = []
    for code in dict.fromkeys(extras):  # dedupe while preserving order
        label, per_day = _EXTRA_DEFINITIONS[code]
        unit_rate = _extra_rate(code)
        quantity = days if per_day else 1
        extra_lines.append(
            QuoteExtraLine(
                code=code,
                label=label,
                quantity=quantity,
                unit_rate_kes=unit_rate,
                amount_kes=quantity * unit_rate,
                taxable=True,
            )
        )

    extras_total = sum(line.amount_kes for line in extra_lines)
    taxable_subtotal_kes = base_rental_kes + chauffeur_fee_kes + extras_total
    vat_kes = _vat(taxable_subtotal_kes, settings.VAT_PERCENT)
    deposit_kes = vehicle.deposit_kes
    if with_chauffeur:
        deposit_kes = (
            deposit_kes * settings.CHAUFFEUR_DEPOSIT_PERCENT // 100
        )
    total_due_kes = taxable_subtotal_kes + vat_kes + deposit_kes

    return QuoteResponse(
        vehicle_id=vehicle.id,
        daily_rate_kes=vehicle.daily_rate_kes,
        days=days,
        base_rental_kes=base_rental_kes,
        chauffeur_zone=zone,
        chauffeur_days=chauffeur_days,
        chauffeur_rate_kes=rate,
        chauffeur_fee_kes=chauffeur_fee_kes,
        extras=extra_lines,
        taxable_subtotal_kes=taxable_subtotal_kes,
        vat_percent=settings.VAT_PERCENT,
        vat_kes=vat_kes,
        deposit_kes=deposit_kes,
        total_due_kes=total_due_kes,
    )
