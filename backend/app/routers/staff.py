"""Staff management endpoints (owner/manager only)."""

from uuid import UUID

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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.common import SuccessEnvelope
from app.services.image_service import delete_image_file, read_image
from app.schemas.staff import (
    StaffCreate,
    StaffResponse,
    StaffRoleUpdate,
    StaffStatusUpdate,
)
from app.services.audit_service import record_audit, snapshot
from app.services.auth_service import revoke_all_refresh_tokens

router = APIRouter(prefix="/staff", tags=["staff"])

_AUDITED_FIELDS = ["email", "full_name", "phone", "role", "is_active"]


def _actor(payload: dict) -> tuple[UUID, str]:
    return UUID(payload["sub"]), payload["role"]


async def _get_staff_or_404(db: AsyncSession, staff_id: UUID) -> User:
    user = await db.get(User, staff_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found",
        )
    return user


async def _active_owner_count(db: AsyncSession) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.OWNER, User.is_active.is_(True))
    )


@router.get("", response_model=SuccessEnvelope[list[StaffResponse]])
async def list_staff(
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))

    result = await db.execute(
        stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    return {"data": result.scalars().all()}


@router.post("", response_model=SuccessEnvelope[StaffResponse])
async def create_staff(
    data: StaffCreate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    actor_id, actor_role = _actor(payload)

    if data.role == UserRole.OWNER and actor_role != UserRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot create an owner",
        )

    existing = await db.scalar(
        select(User).where(User.email == str(data.email))
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already in use",
        )

    user = User(
        email=str(data.email),
        full_name=data.full_name,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    await record_audit(
        db,
        actor_id=actor_id,
        action="staff.create",
        entity="user",
        entity_id=str(user.id),
        after=snapshot(user, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(user)
    return {"data": user}


@router.patch("/{staff_id}/role", response_model=SuccessEnvelope[StaffResponse])
async def change_staff_role(
    staff_id: UUID,
    data: StaffRoleUpdate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    actor_id, actor_role = _actor(payload)
    target = await _get_staff_or_404(db, staff_id)

    if actor_id == target.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own role",
        )

    if (
        actor_role == UserRole.MANAGER.value
        and target.role == UserRole.OWNER
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot modify an owner",
        )

    if (
        data.role == UserRole.OWNER
        and actor_role != UserRole.OWNER.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot promote a user to owner",
        )

    if (
        target.role == UserRole.OWNER
        and data.role != UserRole.OWNER
        and await _active_owner_count(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The last owner cannot be demoted",
        )

    before = snapshot(target, _AUDITED_FIELDS)
    target.role = data.role
    target.auth_version += 1
    await revoke_all_refresh_tokens(db, target.id)

    await record_audit(
        db,
        actor_id=actor_id,
        action="staff.role-change",
        entity="user",
        entity_id=str(target.id),
        before=before,
        after=snapshot(target, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(target)
    return {"data": target}


@router.patch("/{staff_id}/status", response_model=SuccessEnvelope[StaffResponse])
async def change_staff_status(
    staff_id: UUID,
    data: StaffStatusUpdate,
    request: Request,
    payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    actor_id, actor_role = _actor(payload)
    target = await _get_staff_or_404(db, staff_id)

    if actor_id == target.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot deactivate yourself",
        )

    if (
        actor_role == UserRole.MANAGER.value
        and target.role == UserRole.OWNER
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot modify an owner",
        )

    if (
        not data.is_active
        and target.role == UserRole.OWNER
        and await _active_owner_count(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The last owner cannot be deactivated",
        )

    before = snapshot(target, _AUDITED_FIELDS)
    target.is_active = data.is_active
    target.auth_version += 1
    await revoke_all_refresh_tokens(db, target.id)

    await record_audit(
        db,
        actor_id=actor_id,
        action=(
            "staff.reactivate" if data.is_active else "staff.deactivate"
        ),
        entity="user",
        entity_id=str(target.id),
        before=before,
        after=snapshot(target, _AUDITED_FIELDS),
        request_id=getattr(request.state, "request_id", None),
    )

    await db.flush()
    await db.refresh(target)
    return {"data": target}


@router.post(
    "/{staff_id}/photo", response_model=SuccessEnvelope[StaffResponse]
)
async def upload_staff_photo(
    staff_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Upload or replace a staff member's profile image."""
    actor_id, actor_role = _actor(payload)
    target = await _get_staff_or_404(db, staff_id)

    if actor_role == UserRole.MANAGER.value and target.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot modify an owner",
        )

    content, content_type = await read_image(file)
    previous = target.avatar_url
    target.avatar_data = content
    target.avatar_content_type = content_type
    target.avatar_url = f"/public/profile-photos/users/{target.id}"

    await record_audit(
        db,
        actor_id=actor_id,
        action="staff.photo-update",
        entity="user",
        entity_id=str(target.id),
        after={"avatar_url": url},
        request_id=getattr(request.state, "request_id", None),
    )
    await db.flush()
    await db.refresh(target)
    delete_image_file(previous)
    return {"data": target}


@router.delete(
    "/{staff_id}/photo", response_model=SuccessEnvelope[StaffResponse]
)
async def remove_staff_photo(
    staff_id: UUID,
    request: Request,
    payload: dict = Depends(require_permission(Permission.STAFF_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    actor_id, actor_role = _actor(payload)
    target = await _get_staff_or_404(db, staff_id)

    if actor_role == UserRole.MANAGER.value and target.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager cannot modify an owner",
        )

    previous = target.avatar_url
    target.avatar_url = None
    target.avatar_data = None
    target.avatar_content_type = None

    await record_audit(
        db,
        actor_id=actor_id,
        action="staff.photo-remove",
        entity="user",
        entity_id=str(target.id),
        before={"avatar_url": previous},
        request_id=getattr(request.state, "request_id", None),
    )
    await db.flush()
    await db.refresh(target)
    delete_image_file(previous)
    return {"data": target}
