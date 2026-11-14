"""Health check endpoint, including database connectivity."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.common import SuccessEnvelope

router = APIRouter(tags=["health"])


class HealthData(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=SuccessEnvelope[HealthData])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Report whether the API process and PostgreSQL are both healthy.

    Reaching this handler already proves the FastAPI process is running.
    The `SELECT 1` proves we can actually talk to the database.
    """
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )

    return {"data": {"status": "healthy", "database": "connected"}}
