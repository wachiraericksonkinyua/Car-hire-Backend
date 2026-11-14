"""ORM models package.

Importing this package registers every model with `Base.metadata`, so
Alembic and `create_all()` can discover all tables.
"""

from app.models.audit import AuditLog
from app.models.booking import Booking, BookingStatus, TripStatus
from app.models.booking_counter import BookingCounter
from app.models.driver import DriverProfile, DriverStatus
from app.models.incident import Incident, IncidentStatus
from app.models.inspection import Inspection, InspectionKind
from app.models.mechanic import Mechanic
from app.models.payment import Payment, PaymentStatus
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.vehicle_photo import VehiclePhoto

__all__ = [
    "AuditLog",
    "Booking",
    "BookingCounter",
    "BookingStatus",
    "DriverProfile",
    "DriverStatus",
    "Incident",
    "IncidentStatus",
    "Inspection",
    "InspectionKind",
    "Mechanic",
    "Payment",
    "PaymentStatus",
    "RefreshToken",
    "TripStatus",
    "User",
    "UserRole",
    "Vehicle",
    "VehiclePhoto",
    "VehicleStatus",
]
