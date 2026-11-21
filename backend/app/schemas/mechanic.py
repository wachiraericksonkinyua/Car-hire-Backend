"""Mechanic directory schemas.

GeoJSON coordinate order is [longitude, latitude].
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.utils.phone import normalize_kenyan_phone


class GeoPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: list[float]


def _normalise_optional_phone(value: str | None) -> str | None:
    return normalize_kenyan_phone(value) if value else None


class MechanicCreate(BaseModel):
    name: str
    garage: str | None = None
    phone: str
    whatsapp: str | None = None
    county: str
    town: str | None = None
    mechanic_type: Literal["InHouse", "PartnerGarage", "Towing"] | None = None
    specialties: list[str] = []
    call_out_rate_kes: int | None = Field(default=None, ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_available: bool = True

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_kenyan_phone(value)

    @field_validator("whatsapp")
    @classmethod
    def _whatsapp(cls, value: str | None) -> str | None:
        return _normalise_optional_phone(value)


class MechanicUpdate(BaseModel):
    name: str | None = None
    garage: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    county: str | None = None
    town: str | None = None
    mechanic_type: Literal["InHouse", "PartnerGarage", "Towing"] | None = None
    specialties: list[str] | None = None
    call_out_rate_kes: int | None = Field(default=None, ge=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_available: bool | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalize_kenyan_phone(value) if value else None

    @field_validator("whatsapp")
    @classmethod
    def _whatsapp(cls, value: str | None) -> str | None:
        return _normalise_optional_phone(value)


class MechanicResponse(BaseModel):
    id: UUID
    name: str
    garage: str | None
    phone: str
    whatsapp: str | None
    county: str
    town: str | None
    mechanic_type: str | None
    specialties: list[str] | None
    call_out_rate_kes: int | None
    location: GeoPoint
    is_available: bool
    distance_km: float | None = None
    created_at: datetime
