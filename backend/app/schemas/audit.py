"""Audit log response schemas (read-only)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID | None
    action: str
    entity: str
    entity_id: str | None
    before: dict | None
    after: dict | None
    request_id: str | None
    created_at: datetime
