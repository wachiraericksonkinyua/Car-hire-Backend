"""Find the mechanics closest to a breakdown location."""

from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mechanic import Mechanic

# Mean radius of the Earth in kilometres.
EARTH_RADIUS_KM = 6371.0


def _haversine_km(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> float:
    """Great-circle distance between two lat/lng points, in kilometres.

    This is plain Python so the same code works on SQLite (tests) and
    PostgreSQL (production). It can later be swapped for PostGIS
    `ST_Distance` when the database grows large enough to need spatial
    indexes.
    """
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)

    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


async def find_nearest_mechanics(
    db: AsyncSession,
    lat: float,
    lng: float,
    limit: int = 5,
    max_distance_km: float = 50.0,
) -> list[tuple[Mechanic, float]]:
    """Return (mechanic, distance_km) pairs, nearest first.

    Only available mechanics within `max_distance_km` are considered.
    """
    stmt = select(Mechanic).where(Mechanic.is_available.is_(True))
    result = await db.execute(stmt)
    mechanics = result.scalars().all()

    ranked = sorted(
        (
            (mechanic, _haversine_km(lat, lng, mechanic.latitude, mechanic.longitude))
            for mechanic in mechanics
        ),
        key=lambda pair: pair[1],
    )

    within_range = [
        pair for pair in ranked if pair[1] <= max_distance_km
    ]
    return within_range[:limit]
