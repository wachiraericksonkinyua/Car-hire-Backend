"""Vehicle schemas for fleet list, detail, create and edit."""

import re
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.vehicle import VehicleStatus

_PLATE_RE = re.compile(r"^K[A-Z]{2}\s?\d{3}[A-Z]$")


def normalise_plate(value: str) -> str:
    plate = value.strip().upper()
    plate = re.sub(r"\s+", " ", plate)
    if not _PLATE_RE.fullmatch(plate):
        raise ValueError("Plate must look like KDA 123A")
    if " " not in plate:
        plate = f"{plate[:3]} {plate[3:]}"
    return plate


class VehicleCreate(BaseModel):
    plate_number: str
    brand: str
    model: str
    year: int = Field(ge=1900, le=2100)
    category: str
    transmission: str
    fuel: str
    seats: int = Field(ge=1, le=100)
    bags: int = Field(default=0, ge=0)
    daily_rate_kes: int = Field(ge=0)
    deposit_kes: int = Field(ge=0)
    mileage_cap_km: int = Field(ge=0)
    insurance_expiry: date
    specs: dict | None = None
    status: VehicleStatus = VehicleStatus.AVAILABLE

    @field_validator("plate_number")
    @classmethod
    def _plate(cls, value: str) -> str:
        return normalise_plate(value)


class VehicleUpdate(BaseModel):
    plate_number: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    category: str | None = None
    transmission: str | None = None
    fuel: str | None = None
    seats: int | None = Field(default=None, ge=1, le=100)
    bags: int | None = Field(default=None, ge=0)
    daily_rate_kes: int | None = Field(default=None, ge=0)
    deposit_kes: int | None = Field(default=None, ge=0)
    mileage_cap_km: int | None = Field(default=None, ge=0)
    insurance_expiry: date | None = None
    specs: dict | None = None
    status: VehicleStatus | None = None

    @field_validator("plate_number")
    @classmethod
    def _plate(cls, value: str | None) -> str | None:
        return normalise_plate(value) if value is not None else None


class VehiclePhotoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    url: str
    sort_order: int
    created_at: datetime


class VehicleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plate_number: str
    brand: str
    model: str
    year: int
    category: str
    transmission: str
    fuel: str
    seats: int
    bags: int
    daily_rate_kes: int
    deposit_kes: int
    mileage_cap_km: int
    insurance_expiry: date
    specs: dict | None
    status: str
    insurance_expired: bool
    created_at: datetime
    photos: list[VehiclePhotoResponse] = []


class VehicleListData(BaseModel):
    items: list[VehicleResponse]
    total: int
    limit: int
    offset: int


class BookedRange(BaseModel):
    booking_id: UUID
    reference: str
    pickup_at: datetime
    return_at: datetime
    block_until: datetime
    status: str


class VehicleDetailResponse(VehicleResponse):
    booked_ranges: list[BookedRange]
