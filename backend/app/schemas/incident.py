"""Breakdown incident schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, model_validator

from app.schemas.mechanic import GeoPoint

DispatchType = Literal["PartnerMechanic", "InHouseRescue", "ReplacementVehicle"]


class IncidentCreate(BaseModel):
    vehicle_id: UUID
    booking_id: UUID | None = None
    category: str
    description: str | None = None
    latitude: float
    longitude: float
    requires_workshop: bool = False


class IncidentDispatchRequest(BaseModel):
    dispatch_type: DispatchType
    mechanic_id: UUID | None = None

    @model_validator(mode="after")
    def _partner_requires_mechanic(self):
        if self.dispatch_type == "PartnerMechanic" and self.mechanic_id is None:
            raise ValueError("mechanic_id is required for a partner mechanic")
        return self


class IncidentResolveRequest(BaseModel):
    resolution_notes: str | None = None


class IncidentResponse(BaseModel):
    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    booking_id: UUID | None
    booking_reference: str | None
    category: str
    description: str | None
    location: GeoPoint
    status: str
    dispatch_type: str | None
    requires_workshop: bool
    mechanic_id: UUID | None
    mechanic_name: str | None
    affected_booking_ids: list[str] | None
    created_at: datetime
    resolved_at: datetime | None
