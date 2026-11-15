"""Quote request/response schemas.

All amounts are whole Kenyan Shillings (integers).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ExtraCode = Literal[
    "baby_seat",
    "rooftop_tent",
    "cooler_box",
    "airport_pickup",
]
ChauffeurZone = Literal["in_town", "upcountry"]


class QuoteRequest(BaseModel):
    vehicle_id: UUID
    pickup_at: datetime
    return_at: datetime
    with_chauffeur: bool = False
    chauffeur_zone: ChauffeurZone | None = None
    extras: list[ExtraCode] = Field(default_factory=list)

    @model_validator(mode="after")
    def _valid_period(self):
        if self.return_at <= self.pickup_at:
            raise ValueError("return_at must be after pickup_at")
        return self


class QuoteExtraLine(BaseModel):
    code: str
    label: str
    quantity: int
    unit_rate_kes: int
    amount_kes: int
    taxable: bool


class QuoteResponse(BaseModel):
    vehicle_id: UUID
    daily_rate_kes: int
    days: int

    base_rental_kes: int
    chauffeur_zone: str | None
    chauffeur_days: int
    chauffeur_rate_kes: int
    chauffeur_fee_kes: int
    extras: list[QuoteExtraLine]

    taxable_subtotal_kes: int
    vat_percent: int
    vat_kes: int
    deposit_kes: int
    total_due_kes: int
