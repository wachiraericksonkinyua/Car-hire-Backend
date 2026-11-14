"""Driver roster, availability and trip schemas."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DriverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    full_name: str
    phone: str | None
    licence_class: str
    licence_expiry: date
    psv_expiry: date
    status: str
    languages: list[str] | None
    rating: float | None
    licence_expired: bool
    psv_expired: bool


class AssignDriverRequest(BaseModel):
    driver_id: UUID


class DriverTripResponse(BaseModel):
    booking_id: UUID
    reference: str
    status: str
    trip_status: str | None
    customer_name: str
    customer_phone: str
    pickup_at: datetime
    return_at: datetime
    pickup_location: str | None
    vehicle_plate: str
    vehicle_model: str


class TripStatusUpdate(BaseModel):
    status: Literal["EnRoute", "CustomerOnboard", "Completed"]
