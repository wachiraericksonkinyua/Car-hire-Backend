"""Mechanic directory and nearest-mechanic endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.mechanic import Mechanic
from app.schemas.common import SuccessEnvelope
from app.schemas.mechanic import (
    GeoPoint,
    MechanicCreate,
    MechanicResponse,
    MechanicUpdate,
)
from app.services.audit_service import record_audit, snapshot
from app.services.mechanic_service import find_nearest_mechanics

router = APIRouter(prefix="/mechanics", tags=["mechanics"])


def _response(mechanic: Mechanic, distance_km: float | None = None):
    return MechanicResponse(
        id=mechanic.id,
        name=mechanic.name,
        garage=mechanic.garage,
        phone=mechanic.phone,
        whatsapp=mechanic.whatsapp,
        county=mechanic.county,
        town=mechanic.town,
        mechanic_type=mechanic.mechanic_type,
        specialties=mechanic.specialties,
        call_out_rate_kes=mechanic.call_out_rate_kes,
        # GeoJSON is always [longitude, latitude].
        location=GeoPoint(
            coordinates=[mechanic.longitude, mechanic.latitude]
        ),
        is_available=mechanic.is_available,
        distance_km=(
            round(distance_km, 2) if distance_km is not None else None
        ),
        created_at=mechanic.created_at,
    )


@router.get("", response_model=SuccessEnvelope[list[MechanicResponse]])
async def list_mechanics(
    county: str | None = Query(default=None),
    mechanic_type: str | None = Query(default=None),
    specialty: str | None = Query(default=None),
    is_available: bool | None = Query(default=None),
    _payload: dict = Depends(require_permission(Permission.MECHANIC_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Mechanic)
    if county is not None:
        stmt = stmt.where(Mechanic.county.ilike(county))
    if mechanic_type is not None:
        stmt = stmt.where(Mechanic.mechanic_type == mechanic_type)
    if specialty is not None:
        stmt = stmt.where(Mechanic.specialties.contains([specialty]))
    if is_available is not None:
        stmt = stmt.where(Mechanic.is_available.is_(is_available))

    result = await db.execute(stmt.order_by(Mechanic.name))
    return {"data": [_response(item) for item in result.scalars().all()]}


@router.get(
    "/nearest", response_model=SuccessEnvelope[list[MechanicResponse]]
)
async def nearest_mechanics(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    limit: int = Query(default=5, ge=1, le=50),
    max_distance_km: float = Query(default=50, gt=0, le=200),
    _payload: dict = Depends(require_permission(Permission.MECHANIC_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    ranked = await find_nearest_mechanics(
        db,
        lat=lat,
        lng=lng,
        limit=limit,
        max_distance_km=max_distance_km,
    )
    return {
        "data": [
            _response(mechanic, distance_km)
            for mechanic, distance_km in ranked
        ]
    }


@router.post("", response_model=SuccessEnvelope[MechanicResponse])
async def create_mechanic(
    data: MechanicCreate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.MECHANIC_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    mechanic = Mechanic(**data.model_dump())
    db.add(mechanic)
    await db.flush()

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="mechanic.create",
        entity="mechanic",
        entity_id=str(mechanic.id),
        after={
            "name": mechanic.name,
            "phone": mechanic.phone,
            "county": mechanic.county,
            "mechanic_type": mechanic.mechanic_type,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(mechanic)
    return {"data": _response(mechanic)}


@router.patch(
    "/{mechanic_id}", response_model=SuccessEnvelope[MechanicResponse]
)
async def update_mechanic(
    mechanic_id: UUID,
    data: MechanicUpdate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.MECHANIC_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    mechanic = await db.get(Mechanic, mechanic_id)
    if mechanic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mechanic not found",
        )

    fields = [
        "name",
        "garage",
        "phone",
        "whatsapp",
        "county",
        "town",
        "mechanic_type",
        "specialties",
        "call_out_rate_kes",
        "latitude",
        "longitude",
        "is_available",
    ]
    before = snapshot(mechanic, fields)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(mechanic, field, value)

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="mechanic.update",
        entity="mechanic",
        entity_id=str(mechanic.id),
        before=before,
        after=snapshot(mechanic, fields),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(mechanic)
    return {"data": _response(mechanic)}
