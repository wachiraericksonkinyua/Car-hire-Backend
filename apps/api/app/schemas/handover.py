"""Handover request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HandoverRequest(BaseModel):
    fuel_percent: int = Field(ge=0, le=100)
    odometer_km: int = Field(ge=0)
    photos: list[str] = []
    notes: str | None = None
    signature: str | None = None
    confirmation: bool = False
    critical_defect: bool = False

    @model_validator(mode="after")
    def _signature_or_confirmation(self):
        if not self.signature and not self.confirmation:
            raise ValueError(
                "Provide a signature or confirmation before submitting"
            )
        return self


class InspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    booking_id: UUID
    kind: str
    fuel_percent: int
    odometer_km: int
    photos: list[str] | None
    notes: str | None
    signature: str | None
    confirmation: bool
    critical_defect: bool
    late_fee_kes: int | None
    excess_mileage_kes: int | None
    settlement_snapshot: dict | None
    created_at: datetime


class CheckInResponse(InspectionResponse):
    booking_status: str
    vehicle_status: str
    settlement: dict
