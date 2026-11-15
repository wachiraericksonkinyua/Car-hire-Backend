"""Vehicle browsing and fleet management endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.booking import Booking
from app.models.incident import Incident
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.vehicle_photo import VehiclePhoto
from app.schemas.common import SuccessEnvelope
from app.schemas.vehicle import (
    BookedRange,
    VehicleCreate,
    VehicleDetailResponse,
    VehicleListData,
    VehicleResponse,
    VehicleUpdate,
)
from app.services.audit_service import record_audit, snapshot
from app.services.availability_service import (
    apply_availability_filters,
    booked_ranges,
    derive_status,
    effective_block_until,
    insurance_expired,
    status_expressions,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_AUDITED_FIELDS = [
    "plate_number",
    "brand",
    "model",
    "year",
    "category",
    "transmission",
    "fuel",
    "seats",
    "bags",
    "daily_rate_kes",
    "deposit_kes",
    "mileage_cap_km",
    "insurance_expiry",
    "status",
]


def _window(
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[datetime, datetime]:
    if (date_from is None) != (date_to is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide both 'from' and 'to', or neither",
        )
    if date_from is None:
        now = utc_now()
        return now, now
    if date_from >= date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'from' must be before 'to'",
        )
    return date_from, date_to


def _block_until(return_at: datetime) -> datetime:
    return effective_block_until(return_at)


def _to_response(vehicle: Vehicle, *, derived: str) -> VehicleResponse:
    return VehicleResponse(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        brand=vehicle.brand,
        model=vehicle.model,
        year=vehicle.year,
        category=vehicle.category,
        transmission=vehicle.transmission,
        fuel=vehicle.fuel,
        seats=vehicle.seats,
        bags=vehicle.bags,
        daily_rate_kes=vehicle.daily_rate_kes,
        deposit_kes=vehicle.deposit_kes,
        mileage_cap_km=vehicle.mileage_cap_km,
        insurance_expiry=vehicle.insurance_expiry,
        specs=vehicle.specs,
        status=derived,
        insurance_expired=insurance_expired(vehicle, utc_now().date()),
        created_at=vehicle.created_at,
    )


@router.get("", response_model=SuccessEnvelope[VehicleListData])
async def list_vehicles(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    category: str | None = Query(default=None),
    transmission: str | None = Query(default=None),
    fuel: str | None = Query(default=None),
    seats: int | None = Query(default=None, ge=1),
    brand: str | None = Query(default=None),
    vehicle_status: str | None = Query(default=None, alias="status"),
    plate: str | None = Query(default=None),
    available_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _payload: dict = Depends(require_permission(Permission.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """List vehicles with the dynamic status for the requested date window."""
    pickup_at, return_at = _window(date_from, date_to)
    block_until = _block_until(return_at)

    conditions = []
    if category is not None:
        conditions.append(Vehicle.category.ilike(category))
    if transmission is not None:
        conditions.append(Vehicle.transmission.ilike(transmission))
    if fuel is not None:
        conditions.append(Vehicle.fuel.ilike(fuel))
    if seats is not None:
        conditions.append(Vehicle.seats == seats)
    if brand is not None:
        conditions.append(Vehicle.brand.ilike(f"%{brand}%"))
    if plate is not None:
        conditions.append(Vehicle.plate_number.ilike(f"%{plate}%"))
    if vehicle_status is not None and vehicle_status not in {
        "Available",
        "Reserved",
        "Rented",
        "Maintenance",
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown vehicle status",
        )

    count_stmt = apply_availability_filters(
        select(func.count()).select_from(Vehicle).where(*conditions),
        pickup_at=pickup_at,
        block_until=block_until,
        status=vehicle_status,
        available_only=available_only,
    )
    total = await db.scalar(count_stmt)

    is_rented, is_reserved = status_expressions(pickup_at, block_until)
    stmt = (
        select(
            Vehicle,
            is_rented.label("is_rented"),
            is_reserved.label("is_reserved"),
        )
        .where(*conditions)
        .order_by(Vehicle.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    stmt = apply_availability_filters(
        stmt,
        pickup_at=pickup_at,
        block_until=block_until,
        status=vehicle_status,
        available_only=available_only,
    )

    rows = (await db.execute(stmt)).all()
    items = [
        _to_response(
            vehicle,
            derived=derive_status(
                vehicle,
                is_rented=bool(rented),
                is_reserved=bool(reserved),
            ),
        )
        for vehicle, rented, reserved in rows
    ]

    return {
        "data": VehicleListData(
            items=items,
            total=total or 0,
            limit=limit,
            offset=offset,
        )
    }


@router.get("/{vehicle_id}", response_model=SuccessEnvelope[VehicleDetailResponse])
async def get_vehicle(
    vehicle_id: UUID,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    _payload: dict = Depends(require_permission(Permission.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    pickup_at, return_at = _window(date_from, date_to)
    block_until = _block_until(return_at)

    is_rented, is_reserved = status_expressions(pickup_at, block_until)
    row = (
        await db.execute(
            select(Vehicle, is_rented, is_reserved).where(
                Vehicle.id == vehicle_id
            )
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    vehicle, rented, reserved = row
    base = _to_response(
        vehicle,
        derived=derive_status(
            vehicle, is_rented=bool(rented), is_reserved=bool(reserved)
        ),
    )

    ranges = await booked_ranges(db, vehicle_id, days=30)
    return {
        "data": VehicleDetailResponse(
            **base.model_dump(),
            booked_ranges=[
                BookedRange(
                    booking_id=booking.id,
                    reference=booking.reference,
                    pickup_at=booking.pickup_at,
                    return_at=booking.return_at,
                    block_until=booking.block_until,
                    status=booking.status.value,
                )
                for booking in ranges
            ],
        )
    }


@router.post("", response_model=SuccessEnvelope[VehicleResponse])
async def create_vehicle(
    data: VehicleCreate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    duplicate = await db.scalar(
        select(Vehicle.id).where(
            Vehicle.plate_number == data.plate_number
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vehicle with this plate already exists",
        )

    vehicle = Vehicle(**data.model_dump())
    db.add(vehicle)
    await db.flush()

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="vehicle.create",
        entity="vehicle",
        entity_id=str(vehicle.id),
        after=snapshot(vehicle, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(vehicle)
    return {"data": _to_response(vehicle, derived=vehicle.status.value)}


@router.patch("/{vehicle_id}", response_model=SuccessEnvelope[VehicleResponse])
async def update_vehicle(
    vehicle_id: UUID,
    data: VehicleUpdate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    changes = data.model_dump(exclude_unset=True)

    new_plate = changes.get("plate_number")
    if new_plate is not None and new_plate != vehicle.plate_number:
        duplicate = await db.scalar(
            select(Vehicle.id).where(
                Vehicle.plate_number == new_plate,
                Vehicle.id != vehicle_id,
            )
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A vehicle with this plate already exists",
            )

    before = snapshot(vehicle, _AUDITED_FIELDS)
    for field, value in changes.items():
        setattr(vehicle, field, value)

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="vehicle.update",
        entity="vehicle",
        entity_id=str(vehicle.id),
        before=before,
        after=snapshot(vehicle, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(vehicle)
    return {"data": _to_response(vehicle, derived=vehicle.status.value)}


@router.delete("/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: UUID,
    request: Request,
    payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a vehicle that has never been booked or involved in an incident."""
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    has_booking = await db.scalar(
        select(Booking.id).where(Booking.vehicle_id == vehicle_id).limit(1)
    )
    if has_booking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This vehicle has booking history and cannot be deleted. "
                "Set it to Maintenance instead."
            ),
        )

    has_incident = await db.scalar(
        select(Incident.id).where(Incident.vehicle_id == vehicle_id).limit(1)
    )
    if has_incident is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This vehicle has incident history and cannot be deleted. "
                "Set it to Maintenance instead."
            ),
        )

    before = snapshot(vehicle, _AUDITED_FIELDS)
    await db.execute(
        delete(VehiclePhoto).where(VehiclePhoto.vehicle_id == vehicle_id)
    )
    await db.delete(vehicle)

    await record_audit(
        db,
        actor_id=UUID(payload["sub"]),
        action="vehicle.delete",
        entity="vehicle",
        entity_id=str(vehicle_id),
        before=before,
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    return {"data": {"id": str(vehicle_id), "deleted": True}}
