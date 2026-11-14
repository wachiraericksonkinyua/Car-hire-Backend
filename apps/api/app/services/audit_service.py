"""Audit trail writes.

Audit entries are written inside the caller's transaction, so a failed
business change cannot leave a misleading audit row behind.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
        request_id=request_id,
    )
    db.add(entry)
    return entry


def snapshot(instance, fields: list[str]) -> dict[str, Any]:
    """Build a JSON-safe before/after snapshot for the given field names."""
    data: dict[str, Any] = {}
    for field in fields:
        value = getattr(instance, field, None)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, date):
            value = value.isoformat()
        elif isinstance(value, uuid.UUID):
            value = str(value)
        elif hasattr(value, "value"):  # StrEnum
            value = value.value
        data[field] = value
    return data
