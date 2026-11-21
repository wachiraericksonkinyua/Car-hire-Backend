"""Vehicle browsing and fleet management endpoints."""

from datetime import datetime
from uuid import UUID

import shutil
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.booking import Booking
from app.models.incident import Incident
from app.models.inspection import Inspection
from app.models.payment import Payment
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.vehicle_photo import VehiclePhoto
from app.services.driver_service import release_driver_if_idle
from app.schemas.common import SuccessEnvelope
from app.schemas.vehicle import (
    BookedRange,
    VehicleCreate,
    VehicleDetailResponse,
    VehicleListData,
    VehiclePhotoUpdate,
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

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"


def _photo_list_options():
    """Load photo metadata only, never the image bytes, for list responses."""
    return selectinload(Vehicle.photos).load_only(
        VehiclePhoto.id,
        VehiclePhoto.url,
        VehiclePhoto.caption,
        VehiclePhoto.sort_order,
        VehiclePhoto.created_at,
    )

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


def _to_response(
    vehicle: Vehicle,
    *,
    derived: str,
    photos: list[VehiclePhoto] | None = None,
) -> VehicleResponse:
    if photos is None:
        photos = vehicle.__dict__.get("photos", [])
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
        photos=sorted(photos, key=lambda photo: photo.sort_order),
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
        .options(_photo_list_options())
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
            select(Vehicle, is_rented, is_reserved)
            .options(_photo_list_options())
            .where(Vehicle.id == vehicle_id)
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
    """Delete a vehicle and every record that belongs to it.

    Bookings, payments, inspections, incidents and images are removed as
    well, so the plate can be re-added from scratch later.
    """
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    booking_ids = list(
        await db.scalars(
            select(Booking.id).where(Booking.vehicle_id == vehicle_id)
        )
    )
    driver_ids = {
        driver_id
        for driver_id in await db.scalars(
            select(Booking.driver_id).where(
                Booking.vehicle_id == vehicle_id,
                Booking.driver_id.is_not(None),
            )
        )
        if driver_id is not None
    }
    incident_count = await db.scalar(
        select(func.count())
        .select_from(Incident)
        .where(Incident.vehicle_id == vehicle_id)
    )
    payment_count = 0
    inspection_count = 0

    if booking_ids:
        payment_count = await db.scalar(
            select(func.count())
            .select_from(Payment)
            .where(Payment.booking_id.in_(booking_ids))
        )
        inspection_count = await db.scalar(
            select(func.count())
            .select_from(Inspection)
            .where(Inspection.booking_id.in_(booking_ids))
        )

    before = {
        **snapshot(vehicle, _AUDITED_FIELDS),
        "bookings_deleted": len(booking_ids),
        "payments_deleted": payment_count or 0,
        "inspections_deleted": inspection_count or 0,
        "incidents_deleted": incident_count or 0,
    }

    await db.execute(
        delete(Incident).where(Incident.vehicle_id == vehicle_id)
    )
    if booking_ids:
        await db.execute(
            delete(Incident).where(Incident.booking_id.in_(booking_ids))
        )
        await db.execute(
            delete(Payment).where(Payment.booking_id.in_(booking_ids))
        )
        await db.execute(
            delete(Inspection).where(
                Inspection.booking_id.in_(booking_ids)
            )
        )
        await db.execute(
            delete(Booking).where(Booking.vehicle_id == vehicle_id)
        )
    await db.execute(
        delete(VehiclePhoto).where(VehiclePhoto.vehicle_id == vehicle_id)
    )
    await db.execute(delete(Vehicle).where(Vehicle.id == vehicle_id))
    await db.flush()

    for driver_id in driver_ids:
        await release_driver_if_idle(db, driver_id)

    for booking_id in booking_ids:
        shutil.rmtree(
            UPLOAD_ROOT / "inspections" / str(booking_id),
            ignore_errors=True,
        )

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
    return {
        "data": {
            "id": str(vehicle_id),
            "deleted": True,
            "bookings_deleted": len(booking_ids),
            "incidents_deleted": incident_count or 0,
        }
    }


@router.post("/{vehicle_id}/photos")
async def upload_vehicle_photo(
    vehicle_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    _payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Upload a vehicle image and store its bytes in PostgreSQL."""
    vehicle = await db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    if file.content_type not in extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPG, PNG or WebP images are allowed",
        )

    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Each image must be 5 MB or smaller",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded image is empty",
        )

    existing = await db.scalar(
        select(func.count())
        .select_from(VehiclePhoto)
        .where(VehiclePhoto.vehicle_id == vehicle_id)
    )
    if (existing or 0) >= 12:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vehicle can have at most 12 images",
        )

    photo = VehiclePhoto(
        vehicle_id=vehicle_id,
        url="pending",
        caption=(caption or "").strip()[:120] or None,
        sort_order=existing or 0,
        data=content,
        content_type=file.content_type,
        filename=file.filename,
        size_bytes=len(content),
    )
    db.add(photo)
    await db.flush()
    photo.url = (
        f"{request.base_url}api/v1/public/vehicles/{vehicle_id}"
        f"/photos/{photo.id}"
    )
    await db.flush()
    await db.refresh(photo)
    return {
        "data": {
            "id": str(photo.id),
            "url": photo.url,
            "caption": photo.caption,
            "sort_order": photo.sort_order,
        }
    }


@router.delete("/{vehicle_id}/photos/{photo_id}")
async def delete_vehicle_photo(
    vehicle_id: UUID,
    photo_id: UUID,
    _payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(VehiclePhoto, photo_id)
    if photo is None or photo.vehicle_id != vehicle_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle image not found",
        )
    await db.delete(photo)
    await db.flush()
    return {"data": {"id": str(photo_id), "deleted": True}}


@router.patch("/{vehicle_id}/photos/{photo_id}")
async def update_vehicle_photo(
    vehicle_id: UUID,
    photo_id: UUID,
    data: VehiclePhotoUpdate,
    _payload: dict = Depends(require_permission(Permission.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(VehiclePhoto, photo_id)
    if photo is None or photo.vehicle_id != vehicle_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle image not found",
        )
    photo.caption = (data.caption or "").strip()[:120] or None
    await db.flush()
    return {
        "data": {
            "id": str(photo.id),
            "url": photo.url,
            "caption": photo.caption,
            "sort_order": photo.sort_order,
        }
    }


@router.get("/{vehicle_id}/photos/{photo_id}")
async def get_vehicle_photo(
    vehicle_id: UUID,
    photo_id: UUID,
    _payload: dict = Depends(require_permission(Permission.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(VehiclePhoto, photo_id)
    if (
        photo is None
        or photo.vehicle_id != vehicle_id
        or photo.data is None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle image not found",
        )
    return Response(
        content=photo.data,
        media_type=photo.content_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )
