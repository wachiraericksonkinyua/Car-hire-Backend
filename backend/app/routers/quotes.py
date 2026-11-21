"""Quote calculation endpoint (no database writes)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission, require_permission
from app.models.vehicle import Vehicle
from app.schemas.common import SuccessEnvelope
from app.schemas.quote import QuoteRequest, QuoteResponse
from app.services.pricing_service import (
    InvalidRentalPeriodError,
    calculate_quote,
)

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("/calculate", response_model=SuccessEnvelope[QuoteResponse])
async def calculate_quote_endpoint(
    data: QuoteRequest,
    _payload: dict = Depends(require_permission(Permission.BOOKING_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    vehicle = await db.get(Vehicle, data.vehicle_id)
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    try:
        quote = calculate_quote(
            vehicle,
            pickup_at=data.pickup_at,
            return_at=data.return_at,
            with_chauffeur=data.with_chauffeur,
            chauffeur_zone=data.chauffeur_zone,
            extras=data.extras,
        )
    except InvalidRentalPeriodError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return {"data": quote}
