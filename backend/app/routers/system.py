"""System/storage diagnostics for the operations dashboard."""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.schemas.common import SuccessEnvelope

router = APIRouter(prefix="/system", tags=["system"])

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"


def _directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(
        file.stat().st_size for file in path.rglob("*") if file.is_file()
    )


def _pct(used: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(used / total * 100, 1)


@router.get("/storage", response_model=SuccessEnvelope[dict])
async def storage_overview(
    _payload: dict = Depends(require_permission(Permission.DASHBOARD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Database size, table breakdown, uploads and host disk usage."""
    settings = get_settings()

    database_bytes = await db.scalar(
        text("SELECT pg_database_size(current_database())")
    )
    table_rows = (
        await db.execute(
            text(
                """
                SELECT relname AS name,
                       pg_total_relation_size(relid) AS bytes
                FROM pg_catalog.pg_statio_user_tables
                WHERE schemaname = 'public'
                ORDER BY bytes DESC
                LIMIT 20
                """
            )
        )
    ).all()

    uploads_bytes = _directory_size(UPLOAD_ROOT)
    try:
        disk = shutil.disk_usage(UPLOAD_ROOT)
        disk_total, disk_used, disk_free = (
            disk.total,
            disk.used,
            disk.free,
        )
    except OSError:
        disk_total = disk_used = disk_free = 0

    quota_bytes = settings.DATABASE_STORAGE_QUOTA_MB * 1024 * 1024

    return {
        "data": {
            "database": {
                "used_bytes": int(database_bytes or 0),
                "quota_bytes": quota_bytes,
                "quota_mb": settings.DATABASE_STORAGE_QUOTA_MB,
                "percent_used": _pct(
                    int(database_bytes or 0), quota_bytes
                ),
            },
            "uploads": {
                "used_bytes": uploads_bytes,
            },
            "disk": {
                "total_bytes": disk_total,
                "used_bytes": disk_used,
                "free_bytes": disk_free,
                "percent_used": _pct(disk_used, disk_total),
            },
            "tables": [
                {"name": name, "bytes": int(size or 0)}
                for name, size in table_rows
            ],
        }
    }
