"""Pydantic schemas for creating and returning bookings."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    field_validator,
    model_validator,
)

from app.schemas.quote import ChauffeurZone, ExtraCode
from app.utils.phone import normalize_kenyan_phone


class ApproveOfflineRequest(BaseModel):
    """Mandatory details when staff approve an offline payment."""

    payment_method: Literal[
        "Cash",
        "M-Pesa Manual",
        "Bank EFT",
        "Corporate Credit",
    ]
    payment_reference: str
    reason: str | None = None

    @model_validator(mode="after")
    def _corporate_requires_reason(self):
        if self.payment_method == "Corporate Credit" and not (
            self.reason or ""
        ).strip():
            raise ValueError("reason is required for corporate credit")
        return self


class BookingCreate(BaseModel):
    """Body of a booking created by staff. Money is calculated on the server."""

    vehicle_id: UUID
    pickup_at: datetime
    return_at: datetime

    customer_name: str
    customer_phone: str
    customer_email: EmailStr | None = None
    customer_id_type: str | None = None
    customer_id_number: str | None = None

    pickup_location: str | None = None
    with_chauffeur: bool = False
    chauffeur_zone: ChauffeurZone | None = None
    extras: list[ExtraCode] = []

    @field_validator("customer_phone")
    @classmethod
    def _normalise_phone(cls, value: str) -> str:
        return normalize_kenyan_phone(value)


class VehicleSummary(BaseModel):
    id: UUID
    plate_number: str
    brand: str
    model: str


class StaffSummary(BaseModel):
    id: UUID
    full_name: str


class BookingListItem(BaseModel):
    id: UUID
    reference: str
    status: str
    pickup_at: datetime
    return_at: datetime
    vehicle_id: UUID
    vehicle_plate: str
    vehicle_model: str
    customer_name: str
    customer_phone: str
    payment_method: str | None
    total_kes: int
    with_chauffeur: bool
    hold_expires_at: datetime


class BookingListData(BaseModel):
    items: list[BookingListItem]
    total: int
    limit: int
    offset: int


class BookingResponse(BaseModel):
    """Booking data returned to the client, including the final price."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reference: str
    vehicle_id: UUID
    created_by_id: UUID
    driver_id: UUID | None
    trip_status: str | None

    customer_name: str
    customer_phone: str
    customer_email: str | None
    customer_id_type: str | None
    customer_id_number: str | None

    pickup_location: str | None
    pickup_at: datetime
    return_at: datetime

    total_kes: int
    status: str
    hold_expires_at: datetime
    with_chauffeur: bool
    pricing_snapshot: dict | None

    payment_method: str | None
    payment_reference: str | None
    approval_reason: str | None

    created_at: datetime


class BookingDetailResponse(BookingResponse):
    vehicle: VehicleSummary
    created_by: StaffSummary
