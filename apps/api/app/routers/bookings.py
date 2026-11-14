"""Booking endpoints: list, detail, create, approve and cancel."""

from datetime import datetime, timedelta
from math import ceil
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import (
    Permission,
    has_permission,
    require_permission,
)
from app.models.booking import Booking, BookingStatus, TripStatus
from app.models.driver import DriverProfile, DriverStatus
from app.models.inspection import Inspection, InspectionKind
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleStatus
from app.schemas.booking import (
    ApproveOfflineRequest,
    BookingCreate,
    BookingDetailResponse,
    BookingListData,
    BookingListItem,
    BookingResponse,
    StaffSummary,
    VehicleSummary,
)
from app.schemas.common import SuccessEnvelope
from app.schemas.driver import AssignDriverRequest
from app.schemas.handover import (
    CheckInResponse,
    HandoverPreviewRequest,
    HandoverRequest,
    InspectionResponse,
)
from app.services.audit_service import record_audit, snapshot
from app.services.handover_service import calculate_settlement
from app.services.driver_service import (
    driver_has_conflict,
    release_driver_if_idle,
)
from app.services.notification_service import send_sms
from app.services.booking_service import (
    InvalidBookingDatesError,
    VehicleNotFoundError,
    VehicleUnavailableError,
    create_booking,
)
from app.utils.time import as_utc, utc_now

router = APIRouter(prefix="/bookings", tags=["bookings"])

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"

_AUDITED_FIELDS = [
    "status",
    "payment_method",
    "payment_reference",
    "approval_reason",
]


def _actor_id(payload: dict) -> UUID:
    try:
        return UUID(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )


def _list_item(booking: Booking, vehicle: Vehicle) -> BookingListItem:
    return BookingListItem(
        id=booking.id,
        reference=booking.reference,
        status=booking.status.value,
        pickup_at=booking.pickup_at,
        return_at=booking.return_at,
        vehicle_id=vehicle.id,
        vehicle_plate=vehicle.plate_number,
        vehicle_model=f"{vehicle.brand} {vehicle.model}",
        customer_name=booking.customer_name,
        customer_phone=booking.customer_phone,
        payment_method=booking.payment_method,
        total_kes=booking.total_kes,
        with_chauffeur=booking.with_chauffeur,
        hold_expires_at=booking.hold_expires_at,
    )


@router.get("", response_model=SuccessEnvelope[BookingListData])
async def list_bookings(
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    vehicle_id: UUID | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    search: str | None = Query(default=None),
    pending_approval: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _payload: dict = Depends(require_permission(Permission.BOOKING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter is not None:
        conditions.append(Booking.status == status_filter)
    if date_from is not None:
        conditions.append(Booking.block_until > date_from)
    if date_to is not None:
        conditions.append(Booking.pickup_at < date_to)
    if vehicle_id is not None:
        conditions.append(Booking.vehicle_id == vehicle_id)
    if payment_method is not None:
        conditions.append(Booking.payment_method == payment_method)
    if pending_approval:
        conditions.append(Booking.status == BookingStatus.RESERVED)
        conditions.append(Booking.payment_method.is_(None))
    if search is not None:
        pattern = f"%{search}%"
        conditions.append(
            or_(
                Booking.reference.ilike(pattern),
                Booking.customer_name.ilike(pattern),
                Booking.customer_phone.ilike(pattern),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(Booking).where(*conditions)
    )

    rows = (
        await db.execute(
            select(Booking, Vehicle)
            .join(Vehicle, Booking.vehicle_id == Vehicle.id)
            .where(*conditions)
            .order_by(Booking.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    return {
        "data": BookingListData(
            items=[_list_item(booking, vehicle) for booking, vehicle in rows],
            total=total or 0,
            limit=limit,
            offset=offset,
        )
    }


@router.post("", response_model=SuccessEnvelope[BookingResponse])
async def create_new_booking(
    data: BookingCreate,
    payload: dict = Depends(require_permission(Permission.BOOKING_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    """Reserve a car for a customer on behalf of the logged-in staff user."""
    created_by_id = _actor_id(payload)

    try:
        booking = await create_booking(
            db, created_by_id=created_by_id, data=data
        )
        return {"data": booking}
    except VehicleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    except VehicleUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    except InvalidBookingDatesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )


@router.get("/{booking_id}", response_model=SuccessEnvelope[BookingDetailResponse])
async def get_booking(
    booking_id: UUID,
    _payload: dict = Depends(require_permission(Permission.BOOKING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(Booking, Vehicle, User)
            .join(Vehicle, Booking.vehicle_id == Vehicle.id)
            .outerjoin(User, Booking.created_by_id == User.id)
            .where(Booking.id == booking_id)
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    booking, vehicle, creator = row
    base = BookingResponse.model_validate(booking)
    return {
        "data": BookingDetailResponse(
            **base.model_dump(),
            vehicle=VehicleSummary(
                id=vehicle.id,
                plate_number=vehicle.plate_number,
                brand=vehicle.brand,
                model=vehicle.model,
            ),
            created_by=(
                StaffSummary(
                    id=creator.id,
                    full_name=creator.full_name,
                )
                if creator is not None
                else None
            ),
        )
    }


@router.patch(
    "/{booking_id}/approve-offline",
    response_model=SuccessEnvelope[BookingResponse],
)
async def approve_offline_payment(
    booking_id: UUID,
    data: ApproveOfflineRequest,
    request: Request,
    payload: dict = Depends(
        require_permission(Permission.BOOKING_APPROVE_STANDARD)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Staff confirms an offline cash/bank payment for a reservation."""
    actor_id = _actor_id(payload)

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status != BookingStatus.RESERVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only reserved bookings can be approved",
        )

    if as_utc(booking.hold_expires_at) <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The hold has expired; recheck availability and rebook",
        )

    if booking.created_by_id == actor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot approve a booking you created",
        )

    if (
        data.payment_method == "Corporate Credit"
        and not has_permission(
            payload.get("role"), Permission.BOOKING_APPROVE_CORPORATE
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Corporate credit approval requires a manager or owner",
        )

    before = snapshot(booking, _AUDITED_FIELDS)
    booking.status = BookingStatus.CONFIRMED
    booking.payment_method = data.payment_method
    booking.payment_reference = data.payment_reference
    booking.approval_reason = data.reason

    await record_audit(
        db,
        actor_id=actor_id,
        action="booking.approve-offline",
        entity="booking",
        entity_id=str(booking.id),
        before=before,
        after=snapshot(booking, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(booking)
    return {"data": booking}


@router.patch(
    "/{booking_id}/assign-driver",
    response_model=SuccessEnvelope[BookingResponse],
)
async def assign_driver(
    booking_id: UUID,
    data: AssignDriverRequest,
    request: Request,
    payload: dict = Depends(
        require_permission(Permission.BOOKING_ASSIGN_DRIVER)
    ),
    db: AsyncSession = Depends(get_db),
):
    actor_id = _actor_id(payload)

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Drivers can only be assigned to Confirmed bookings",
        )

    if not booking.with_chauffeur:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This booking is self-drive, not chauffeur",
        )

    driver = await db.get(DriverProfile, data.driver_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found",
        )

    driver_user = await db.get(User, driver.user_id)
    if (
        driver_user is None
        or not driver_user.is_active
        or driver_user.role != UserRole.DRIVER
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver account is not active",
        )

    if driver.status == DriverStatus.OFF_DUTY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver is off duty",
        )

    if (
        driver.licence_expiry < booking.pickup_at.date()
        or driver.psv_expiry < booking.pickup_at.date()
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver licence or PSV badge has expired",
        )

    if booking.driver_id == driver.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver is already assigned to this booking",
        )

    if await driver_has_conflict(
        db,
        driver_id=driver.id,
        pickup_at=booking.pickup_at,
        block_until=booking.block_until,
        exclude_booking_id=booking.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver is already assigned to another overlapping trip",
        )

    old_driver_id = booking.driver_id
    before = snapshot(booking, ["driver_id", "trip_status"])
    booking.driver_id = driver.id
    booking.trip_status = TripStatus.ASSIGNED
    driver.status = DriverStatus.ASSIGNED

    if old_driver_id is not None and old_driver_id != driver.id:
        await release_driver_if_idle(db, old_driver_id)

    await record_audit(
        db,
        actor_id=actor_id,
        action="booking.assign-driver",
        entity="booking",
        entity_id=str(booking.id),
        before=before,
        after=snapshot(booking, ["driver_id", "trip_status"]),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(booking)

    if driver_user.phone:
        await send_sms(
            driver_user.phone,
            f"Trip assigned: {booking.reference} on "
            f"{booking.pickup_at:%d %b %Y %H:%M} UTC.",
        )

    return {"data": booking}


@router.post(
    "/{booking_id}/check-out",
    response_model=SuccessEnvelope[InspectionResponse],
)
async def check_out_booking(
    booking_id: UUID,
    data: HandoverRequest,
    request: Request,
    payload: dict = Depends(require_permission(Permission.BOOKING_CHECKOUT)),
    db: AsyncSession = Depends(get_db),
):
    actor_id = _actor_id(payload)

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only Confirmed bookings can be checked out",
        )

    inspection = Inspection(
        booking_id=booking.id,
        kind=InspectionKind.CHECK_OUT,
        fuel_percent=data.fuel_percent,
        odometer_km=data.odometer_km,
        photos=data.photos,
        notes=data.notes,
        signature=data.signature,
        confirmation=data.confirmation,
        critical_defect=data.critical_defect,
        created_by_id=actor_id,
    )
    db.add(inspection)

    before = snapshot(booking, ["status"])
    booking.status = BookingStatus.CHECKED_OUT

    await record_audit(
        db,
        actor_id=actor_id,
        action="booking.check-out",
        entity="booking",
        entity_id=str(booking.id),
        before=before,
        after={
            "status": BookingStatus.CHECKED_OUT.value,
            "fuel_percent": data.fuel_percent,
            "odometer_km": data.odometer_km,
            "critical_defect": data.critical_defect,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(inspection)
    return {"data": inspection}


@router.post(
    "/{booking_id}/check-in",
    response_model=SuccessEnvelope[CheckInResponse],
)
async def check_in_booking(
    booking_id: UUID,
    data: HandoverRequest,
    request: Request,
    payload: dict = Depends(require_permission(Permission.BOOKING_CHECKIN)),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    actor_id = _actor_id(payload)

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status not in {
        BookingStatus.CHECKED_OUT,
        BookingStatus.OVERDUE,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only CheckedOut or Overdue bookings can be checked in",
        )

    vehicle = await db.get(Vehicle, booking.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    checkout = await db.scalar(
        select(Inspection)
        .where(
            Inspection.booking_id == booking.id,
            Inspection.kind == InspectionKind.CHECK_OUT,
        )
        .order_by(Inspection.created_at.desc())
        .limit(1)
    )
    if checkout is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No check-out inspection exists for this booking",
        )

    if data.odometer_km < checkout.odometer_km:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Odometer must be greater than or equal to check-out",
        )

    now = utc_now()
    grace_end = as_utc(booking.return_at) + timedelta(
        minutes=settings.LATE_FEE_GRACE_MINUTES
    )
    if now > grace_end:
        late_hours = ceil((now - grace_end).total_seconds() / 3600)
    else:
        late_hours = 0
    late_fee_kes = late_hours * settings.LATE_FEE_PER_HOUR_KES

    distance_km = data.odometer_km - checkout.odometer_km
    excess_km = max(0, distance_km - vehicle.mileage_cap_km)
    excess_mileage_kes = excess_km * settings.EXCESS_MILEAGE_KES_PER_KM

    deposit_kes = int(
        (booking.pricing_snapshot or {}).get(
            "deposit_kes", vehicle.deposit_kes
        )
    )
    total_charges_kes = late_fee_kes + excess_mileage_kes
    settlement = {
        "deposit_kes": deposit_kes,
        "late_hours": late_hours,
        "late_fee_kes": late_fee_kes,
        "distance_km": distance_km,
        "excess_km": excess_km,
        "excess_mileage_kes": excess_mileage_kes,
        "total_charges_kes": total_charges_kes,
        "refund_due_kes": max(0, deposit_kes - total_charges_kes),
        "balance_due_kes": max(0, total_charges_kes - deposit_kes),
    }

    inspection = Inspection(
        booking_id=booking.id,
        kind=InspectionKind.CHECK_IN,
        fuel_percent=data.fuel_percent,
        odometer_km=data.odometer_km,
        photos=data.photos,
        notes=data.notes,
        signature=data.signature,
        confirmation=data.confirmation,
        critical_defect=data.critical_defect,
        late_fee_kes=late_fee_kes,
        excess_mileage_kes=excess_mileage_kes,
        settlement_snapshot=settlement,
        created_by_id=actor_id,
    )
    db.add(inspection)

    before = snapshot(booking, ["status"])
    booking.status = BookingStatus.COMPLETED
    vehicle.status = (
        VehicleStatus.MAINTENANCE
        if data.critical_defect
        else VehicleStatus.AVAILABLE
    )
    await release_driver_if_idle(db, booking.driver_id)

    await record_audit(
        db,
        actor_id=actor_id,
        action="booking.check-in",
        entity="booking",
        entity_id=str(booking.id),
        before=before,
        after={
            "status": BookingStatus.COMPLETED.value,
            "critical_defect": data.critical_defect,
            "settlement": settlement,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(inspection)
    await db.refresh(booking)
    await db.refresh(vehicle)

    return {
        "data": CheckInResponse(
            **InspectionResponse.model_validate(inspection).model_dump(),
            booking_status=booking.status.value,
            vehicle_status=vehicle.status.value,
            settlement=settlement,
        )
    }


@router.post("/{booking_id}/check-in/settlement")
async def preview_check_in_settlement(
    booking_id: UUID,
    data: HandoverPreviewRequest,
    _payload: dict = Depends(require_permission(Permission.BOOKING_CHECKIN)),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    if booking.status not in {
        BookingStatus.CHECKED_OUT,
        BookingStatus.OVERDUE,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only CheckedOut or Overdue bookings can be checked in",
        )

    vehicle = await db.get(Vehicle, booking.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    checkout = await db.scalar(
        select(Inspection)
        .where(
            Inspection.booking_id == booking.id,
            Inspection.kind == InspectionKind.CHECK_OUT,
        )
        .order_by(Inspection.created_at.desc())
        .limit(1)
    )
    if checkout is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No check-out inspection exists for this booking",
        )
    if data.odometer < checkout.odometer_km:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Odometer must be greater than or equal to check-out",
        )

    amount = calculate_settlement(
        booking,
        vehicle,
        checkout_odometer_km=checkout.odometer_km,
        odometer_km=data.odometer,
        now=utc_now(),
    )
    return {
        "data": {
            "graceHours": amount["grace_hours"],
            "lateHours": amount["late_hours"],
            "lateFeeKes": amount["late_fee_kes"],
            "odometerDifferenceKm": amount["distance_km"],
            "includedMileageKm": amount["included_mileage_km"],
            "excessMileageKm": amount["excess_km"],
            "excessMileageRateKes": amount["excess_mileage_rate_kes"],
            "excessMileageChargeKes": amount["excess_mileage_kes"],
            "totalKes": amount["total_charges_kes"],
        }
    }


@router.post("/{booking_id}/inspections/photos")
async def upload_inspection_photo(
    booking_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    _payload: dict = Depends(require_permission(Permission.BOOKING_CHECKOUT)),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    extension = extensions.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPG, PNG or WebP images are allowed",
        )

    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Each photo must be 5 MB or smaller",
        )

    target_dir = UPLOAD_ROOT / "inspections" / str(booking.id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{extension}"
    (target_dir / filename).write_bytes(content)

    return {
        "data": {
            "url": (
                f"{request.base_url}uploads/inspections/"
                f"{booking.id}/{filename}"
            )
        }
    }


@router.post(
    "/{booking_id}/cancel",
    response_model=SuccessEnvelope[BookingResponse],
)
async def cancel_booking(
    booking_id: UUID,
    request: Request,
    payload: dict = Depends(require_permission(Permission.BOOKING_CANCEL)),
    db: AsyncSession = Depends(get_db),
):
    actor_id = _actor_id(payload)

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status not in {
        BookingStatus.RESERVED,
        BookingStatus.CONFIRMED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only Reserved or Confirmed bookings can be cancelled",
        )

    before = snapshot(booking, ["status"])
    booking.status = BookingStatus.CANCELLED
    await release_driver_if_idle(db, booking.driver_id)

    await record_audit(
        db,
        actor_id=actor_id,
        action="booking.cancel",
        entity="booking",
        entity_id=str(booking.id),
        before=before,
        after=snapshot(booking, ["status"]),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(booking)
    return {"data": booking}
