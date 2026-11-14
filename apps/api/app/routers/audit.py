"""Read-only audit log endpoint for owners.

There is deliberately no update or delete route for audit entries.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogResponse
from app.schemas.common import SuccessEnvelope

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=SuccessEnvelope[list[AuditLogResponse]])
async def list_audit_logs(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    actor_id: UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    entity: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _payload: dict = Depends(require_permission(Permission.AUDIT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditLog)

    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if entity is not None:
        stmt = stmt.where(AuditLog.entity == entity)

    result = await db.execute(
        stmt.order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return {"data": result.scalars().all()}
