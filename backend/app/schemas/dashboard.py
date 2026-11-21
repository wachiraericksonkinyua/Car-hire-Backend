"""Dashboard aggregation response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FleetStatus(BaseModel):
    available: int
    reserved: int
    rented: int
    maintenance: int


class DashboardKpis(BaseModel):
    vehicles_out_today: int
    pickups_due_today: int
    returns_due_today: int
    overdue: int
    pending_approvals: int
    active_breakdowns: int
    monthly_revenue_kes: int | None
    fleet_status: FleetStatus


class BookingBrief(BaseModel):
    id: UUID
    reference: str
    customer_name: str
    vehicle_plate: str
    pickup_at: datetime
    return_at: datetime
    status: str


class ActivityBrief(BaseModel):
    action: str
    entity: str
    entity_id: str | None
    created_at: datetime


class DashboardResponse(BaseModel):
    kpis: DashboardKpis
    pickups_today: list[BookingBrief]
    returns_today: list[BookingBrief]
    recent_activity: list[ActivityBrief]
