"""Dashboard aggregation endpoint.

"Today" and "this month" are calculated in Africa/Nairobi (EAT), while all
stored timestamps remain UTC.
"""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import (
    Permission,
    has_permission,
    require_permission,
)
from app.models.audit import AuditLog
from app.models.booking import Booking, BookingStatus
from app.models.incident import Incident, IncidentStatus
from app.models.payment import Payment, PaymentStatus
from app.models.vehicle import Vehicle
from app.schemas.common import SuccessEnvelope
from app.schemas.dashboard import (
    ActivityBrief,
    BookingBrief,
    DashboardKpis,
    DashboardResponse,
    FleetStatus,
)
from app.services.availability_service import apply_availability_filters
from app.utils.time import utc_now

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

EAT = ZoneInfo("Africa/Nairobi")

_ACTIVE_INCIDENTS = (
    IncidentStatus.OPEN,
    IncidentStatus.DISPATCHED,
    IncidentStatus.EN_ROUTE,
)


def _day_bounds(now: datetime):
    today = now.astimezone(EAT).date()
    start = datetime.combine(today, time.min, tzinfo=EAT).astimezone(
        timezone.utc
    )
    return start, start + timedelta(days=1)


def _month_bounds(now: datetime):
    today = now.astimezone(EAT).date()
    first = today.replace(day=1)
    start = datetime.combine(first, time.min, tzinfo=EAT).astimezone(
        timezone.utc
    )
    if first.month == 12:
        nxt = first.replace(year=first.year + 1, month=1)
    else:
        nxt = first.replace(month=first.month + 1)
    end = datetime.combine(nxt, time.min, tzinfo=EAT).astimezone(
        timezone.utc
    )
    return start, end


def _brief(booking: Booking, plate: str) -> BookingBrief:
    return BookingBrief(
        id=booking.id,
        reference=booking.reference,
        customer_name=booking.customer_name,
        vehicle_plate=plate,
        pickup_at=booking.pickup_at,
        return_at=booking.return_at,
        status=booking.status.value,
    )


@router.get("", response_model=SuccessEnvelope[DashboardResponse])
async def dashboard(
    payload: dict = Depends(require_permission(Permission.DASHBOARD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    now = utc_now()
    day_start, day_end = _day_bounds(now)
    month_start, month_end = _month_bounds(now)
    role = payload.get("role")

    vehicles_out = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.status.in_(
                [BookingStatus.CHECKED_OUT, BookingStatus.OVERDUE]
            )
        )
    )

    pickups_due = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.status.in_(
                [BookingStatus.RESERVED, BookingStatus.CONFIRMED]
            ),
            Booking.pickup_at >= day_start,
            Booking.pickup_at < day_end,
        )
    )

    returns_due = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.status.in_(
                [BookingStatus.CHECKED_OUT, BookingStatus.OVERDUE]
            ),
            Booking.return_at >= day_start,
            Booking.return_at < day_end,
        )
    )

    overdue = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.status == BookingStatus.OVERDUE)
    )

    pending_approvals = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.status == BookingStatus.RESERVED,
            Booking.payment_method.is_(None),
        )
    )

    active_breakdowns = await db.scalar(
        select(func.count())
        .select_from(Incident)
        .where(Incident.status.in_(_ACTIVE_INCIDENTS))
    )

    monthly_revenue = None
    if has_permission(role, Permission.DASHBOARD_REVENUE):
        monthly_revenue = await db.scalar(
            select(func.coalesce(func.sum(Payment.amount_kes), 0)).where(
                Payment.status == PaymentStatus.COMPLETED,
                Payment.created_at >= month_start,
                Payment.created_at < month_end,
            )
        )

    fleet_status = {}
    for name in ("Available", "Reserved", "Rented", "Maintenance"):
        stmt = apply_availability_filters(
            select(func.count()).select_from(Vehicle),
            pickup_at=now,
            block_until=now,
            status=name,
            available_only=False,
        )
        fleet_status[name.lower()] = await db.scalar(stmt) or 0

    pickup_rows = (
        await db.execute(
            select(Booking, Vehicle.plate_number)
            .join(Vehicle, Booking.vehicle_id == Vehicle.id)
            .where(
                Booking.status.in_(
                    [BookingStatus.RESERVED, BookingStatus.CONFIRMED]
                ),
                Booking.pickup_at >= day_start,
                Booking.pickup_at < day_end,
            )
            .order_by(Booking.pickup_at)
        )
    ).all()

    return_rows = (
        await db.execute(
            select(Booking, Vehicle.plate_number)
            .join(Vehicle, Booking.vehicle_id == Vehicle.id)
            .where(
                Booking.status.in_(
                    [BookingStatus.CHECKED_OUT, BookingStatus.OVERDUE]
                ),
                Booking.return_at >= day_start,
                Booking.return_at < day_end,
            )
            .order_by(Booking.return_at)
        )
    ).all()

    recent = (
        await db.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)
        )
    ).scalars().all()

    return {
        "data": DashboardResponse(
            kpis=DashboardKpis(
                vehicles_out_today=vehicles_out or 0,
                pickups_due_today=pickups_due or 0,
                returns_due_today=returns_due or 0,
                overdue=overdue or 0,
                pending_approvals=pending_approvals or 0,
                active_breakdowns=active_breakdowns or 0,
                monthly_revenue_kes=monthly_revenue,
                fleet_status=FleetStatus(**fleet_status),
            ),
            pickups_today=[
                _brief(booking, plate) for booking, plate in pickup_rows
            ],
            returns_today=[
                _brief(booking, plate) for booking, plate in return_rows
            ],
            recent_activity=[
                ActivityBrief(
                    action=entry.action,
                    entity=entry.entity,
                    entity_id=entry.entity_id,
                    created_at=entry.created_at,
                )
                for entry in recent
            ],
        )
    }
