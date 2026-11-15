"""Breakdown incidents and mechanic dispatch."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.booking import Booking, BookingStatus
from app.models.incident import Incident, IncidentStatus
from app.models.mechanic import Mechanic
from app.models.vehicle import Vehicle, VehicleStatus
from app.schemas.common import SuccessEnvelope
from app.schemas.incident import (
    IncidentCreate,
    IncidentDispatchRequest,
    IncidentResolveRequest,
    IncidentResponse,
)
from app.schemas.mechanic import GeoPoint
from app.services.audit_service import record_audit
from app.utils.time import utc_now

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _response(
    incident: Incident,
    *,
    plate: str,
    booking_reference: str | None,
    mechanic_name: str | None,
) -> IncidentResponse:
    return IncidentResponse(
        id=incident.id,
        vehicle_id=incident.vehicle_id,
        vehicle_plate=plate,
        booking_id=incident.booking_id,
        booking_reference=booking_reference,
        category=incident.category,
        description=incident.description,
        location=GeoPoint(
            coordinates=[incident.longitude, incident.latitude]
        ),
        status=incident.status.value,
        dispatch_type=incident.dispatch_type,
        requires_workshop=incident.requires_workshop,
        mechanic_id=incident.mechanic_id,
        mechanic_name=mechanic_name,
        affected_booking_ids=incident.affected_booking_ids,
        created_at=incident.created_at,
        resolved_at=incident.resolved_at,
    )


async def _load_response(db: AsyncSession, incident: Incident) -> IncidentResponse:
    plate = await db.scalar(
        select(Vehicle.plate_number).where(Vehicle.id == incident.vehicle_id)
    )
    booking_reference = None
    if incident.booking_id is not None:
        booking_reference = await db.scalar(
            select(Booking.reference).where(
                Booking.id == incident.booking_id
            )
        )
    mechanic_name = None
    if incident.mechanic_id is not None:
        mechanic_name = await db.scalar(
            select(Mechanic.name).where(
                Mechanic.id == incident.mechanic_id
            )
        )
    return _response(
        incident,
        plate=plate or "",
        booking_reference=booking_reference,
        mechanic_name=mechanic_name,
    )


@router.get("", response_model=SuccessEnvelope[list[IncidentResponse]])
async def list_incidents(
    incident_status: IncidentStatus | None = Query(
        default=None, alias="status"
    ),
    vehicle_id: UUID | None = Query(default=None),
    active_only: bool = Query(default=False),
    _payload: dict = Depends(require_permission(Permission.INCIDENT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Incident, Vehicle.plate_number, Booking.reference, Mechanic.name)
        .join(Vehicle, Incident.vehicle_id == Vehicle.id)
        .outerjoin(Booking, Incident.booking_id == Booking.id)
        .outerjoin(Mechanic, Incident.mechanic_id == Mechanic.id)
    )
    if incident_status is not None:
        stmt = stmt.where(Incident.status == incident_status)
    if vehicle_id is not None:
        stmt = stmt.where(Incident.vehicle_id == vehicle_id)
    if active_only:
        stmt = stmt.where(
            Incident.status.in_(
                [
                    IncidentStatus.OPEN,
                    IncidentStatus.DISPATCHED,
                    IncidentStatus.EN_ROUTE,
                ]
            )
        )

    rows = (
        await db.execute(stmt.order_by(Incident.created_at.desc()))
    ).all()
    return {
        "data": [
            _response(
                incident,
                plate=plate,
                booking_reference=booking_reference,
                mechanic_name=mechanic_name,
            )
            for incident, plate, booking_reference, mechanic_name in rows
        ]
    }


@router.post(
    "/breakdown", response_model=SuccessEnvelope[IncidentResponse]
)
async def report_breakdown(
    data: IncidentCreate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.INCIDENT_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await db.get(Vehicle, data.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    if data.booking_id is not None:
        booking = await db.get(Booking, data.booking_id)
        if booking is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Booking not found",
            )
        if booking.vehicle_id != vehicle.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Booking does not belong to this vehicle",
            )

    incident = Incident(
        vehicle_id=vehicle.id,
        booking_id=data.booking_id,
        category=data.category,
        description=data.description,
        latitude=data.latitude,
        longitude=data.longitude,
        status=IncidentStatus.OPEN,
        requires_workshop=data.requires_workshop,
    )

    affected_ids: list[str] = []
    if data.requires_workshop:
        # An immobilising fault removes the car from service immediately.
        vehicle.status = VehicleStatus.MAINTENANCE
        now = utc_now()
        affected = await db.execute(
            select(Booking.id).where(
                Booking.vehicle_id == vehicle.id,
                Booking.status.in_(
                    [BookingStatus.RESERVED, BookingStatus.CONFIRMED]
                ),
                Booking.pickup_at >= now,
            )
        )
        affected_ids = [str(booking_id) for booking_id in affected.scalars()]
        incident.affected_booking_ids = affected_ids

    db.add(incident)
    await db.flush()

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="incident.breakdown",
        entity="incident",
        entity_id=str(incident.id),
        after={
            "vehicle_id": str(vehicle.id),
            "category": incident.category,
            "requires_workshop": incident.requires_workshop,
            "affected_booking_ids": affected_ids,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(incident)
    return {
        "data": await _load_response(db, incident)
    }


@router.patch(
    "/{incident_id}/resolve",
    response_model=SuccessEnvelope[IncidentResponse],
)
async def resolve_incident(
    incident_id: UUID,
    data: IncidentResolveRequest,
    request: Request,
    payload: dict = Depends(require_permission(Permission.INCIDENT_DISPATCH)),
    db: AsyncSession = Depends(get_db),
):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )
    if incident.status == IncidentStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Incident is already resolved",
        )

    before = {
        "status": incident.status.value,
        "mechanic_id": (
            str(incident.mechanic_id) if incident.mechanic_id else None
        ),
    }
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = utc_now()

    if incident.mechanic_id is not None:
        mechanic = await db.get(Mechanic, incident.mechanic_id)
        if mechanic is not None:
            mechanic.is_available = True

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="incident.resolve",
        entity="incident",
        entity_id=str(incident.id),
        before=before,
        after={
            "status": incident.status.value,
            "resolution_notes": data.resolution_notes,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(incident)
    return {"data": await _load_response(db, incident)}


@router.patch(
    "/{incident_id}/dispatch",
    response_model=SuccessEnvelope[IncidentResponse],
)
async def dispatch_incident(
    incident_id: UUID,
    data: IncidentDispatchRequest,
    request: Request,
    payload: dict = Depends(require_permission(Permission.INCIDENT_DISPATCH)),
    db: AsyncSession = Depends(get_db),
):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    if incident.status == IncidentStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resolved incidents cannot be dispatched",
        )

    mechanic = None
    if data.dispatch_type == "PartnerMechanic":
        mechanic = await db.get(Mechanic, data.mechanic_id)
        if mechanic is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mechanic not found",
            )
        if not mechanic.is_available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Mechanic is not available",
            )
        mechanic.is_available = False

    incident.status = IncidentStatus.DISPATCHED
    incident.dispatch_type = data.dispatch_type
    incident.mechanic_id = mechanic.id if mechanic else None

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="incident.dispatch",
        entity="incident",
        entity_id=str(incident.id),
        after={
            "dispatch_type": data.dispatch_type,
            "mechanic_id": (
                str(mechanic.id) if mechanic is not None else None
            ),
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(incident)
    return {"data": await _load_response(db, incident)}
