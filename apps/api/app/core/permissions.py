"""Central role -> capability matrix.

The matrix mirrors the PDF's Roles and Permissions section. Routes must use
`require_permission("capability")` rather than checking role strings inline.
"""

from fastapi import Depends, HTTPException, status

from app.api.deps import get_current_user_payload


class Permission:
    DASHBOARD_VIEW = "dashboard:view"
    DASHBOARD_REVENUE = "dashboard:revenue"
    TIMELINE_VIEW = "timeline:view"

    VEHICLE_VIEW = "vehicle:view"
    VEHICLE_MANAGE = "vehicle:manage"

    BOOKING_VIEW = "booking:view"
    BOOKING_CREATE = "booking:create"
    BOOKING_CANCEL = "booking:cancel"
    BOOKING_APPROVE_STANDARD = "booking:approve-standard"
    BOOKING_APPROVE_CORPORATE = "booking:approve-corporate"
    BOOKING_CHECKOUT = "booking:checkout"
    BOOKING_CHECKIN = "booking:checkin"
    BOOKING_ASSIGN_DRIVER = "booking:assign-driver"

    PAYMENT_LOG = "payment:log"
    PAYMENT_INITIATE = "payment:initiate"

    DRIVER_VIEW = "driver:view"
    DRIVER_MANAGE = "driver:manage"
    TRIP_VIEW_OWN = "trip:view-own"

    MECHANIC_VIEW = "mechanic:view"
    MECHANIC_MANAGE = "mechanic:manage"
    INCIDENT_VIEW = "incident:view"
    INCIDENT_CREATE = "incident:create"
    INCIDENT_DISPATCH = "incident:dispatch"

    STAFF_MANAGE = "staff:manage"
    AUDIT_VIEW = "audit:view"
    SETTINGS_MANAGE = "settings:manage"
    MAINTENANCE_VIEW = "maintenance:view"


ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {
        Permission.DASHBOARD_VIEW,
        Permission.DASHBOARD_REVENUE,
        Permission.TIMELINE_VIEW,
        Permission.VEHICLE_VIEW,
        Permission.VEHICLE_MANAGE,
        Permission.BOOKING_VIEW,
        Permission.BOOKING_CREATE,
        Permission.BOOKING_CANCEL,
        Permission.BOOKING_APPROVE_STANDARD,
        Permission.BOOKING_APPROVE_CORPORATE,
        Permission.BOOKING_CHECKOUT,
        Permission.BOOKING_CHECKIN,
        Permission.BOOKING_ASSIGN_DRIVER,
        Permission.PAYMENT_LOG,
        Permission.PAYMENT_INITIATE,
        Permission.DRIVER_VIEW,
        Permission.DRIVER_MANAGE,
        Permission.MECHANIC_VIEW,
        Permission.MECHANIC_MANAGE,
        Permission.INCIDENT_VIEW,
        Permission.INCIDENT_CREATE,
        Permission.INCIDENT_DISPATCH,
        Permission.STAFF_MANAGE,
        Permission.AUDIT_VIEW,
        Permission.SETTINGS_MANAGE,
        Permission.MAINTENANCE_VIEW,
    },
    "manager": {
        Permission.DASHBOARD_VIEW,
        Permission.DASHBOARD_REVENUE,
        Permission.TIMELINE_VIEW,
        Permission.VEHICLE_VIEW,
        Permission.VEHICLE_MANAGE,
        Permission.BOOKING_VIEW,
        Permission.BOOKING_CREATE,
        Permission.BOOKING_CANCEL,
        Permission.BOOKING_APPROVE_STANDARD,
        Permission.BOOKING_APPROVE_CORPORATE,
        Permission.BOOKING_CHECKOUT,
        Permission.BOOKING_CHECKIN,
        Permission.BOOKING_ASSIGN_DRIVER,
        Permission.PAYMENT_LOG,
        Permission.PAYMENT_INITIATE,
        Permission.DRIVER_VIEW,
        Permission.DRIVER_MANAGE,
        Permission.MECHANIC_VIEW,
        Permission.MECHANIC_MANAGE,
        Permission.INCIDENT_VIEW,
        Permission.INCIDENT_CREATE,
        Permission.INCIDENT_DISPATCH,
        Permission.STAFF_MANAGE,
        Permission.MAINTENANCE_VIEW,
    },
    "agent": {
        Permission.DASHBOARD_VIEW,
        Permission.TIMELINE_VIEW,
        Permission.VEHICLE_VIEW,
        Permission.BOOKING_VIEW,
        Permission.BOOKING_CREATE,
        Permission.BOOKING_CANCEL,
        Permission.BOOKING_APPROVE_STANDARD,
        Permission.BOOKING_CHECKOUT,
        Permission.BOOKING_CHECKIN,
        Permission.BOOKING_ASSIGN_DRIVER,
        Permission.PAYMENT_LOG,
        Permission.PAYMENT_INITIATE,
        Permission.DRIVER_VIEW,
        Permission.MECHANIC_VIEW,
        Permission.INCIDENT_VIEW,
        Permission.INCIDENT_CREATE,
        Permission.INCIDENT_DISPATCH,
    },
    "driver": {
        # Drivers only see/operate their own trips (dedicated endpoints land
        # with driver assignment). General check-in/out would leak other trips.
        Permission.TRIP_VIEW_OWN,
        Permission.MECHANIC_VIEW,
        Permission.INCIDENT_CREATE,
    },
    "mechanic": {
        Permission.VEHICLE_VIEW,
        Permission.MAINTENANCE_VIEW,
        Permission.INCIDENT_VIEW,
    },
}


def has_permission(role: str | None, capability: str) -> bool:
    if role is None:
        return False
    return capability in ROLE_PERMISSIONS.get(role, set())


def require_permission(capability: str):
    """Dependency factory: require the role matrix to allow `capability`."""

    def checker(
        payload: dict = Depends(get_current_user_payload),
    ) -> dict:
        if not has_permission(payload.get("role"), capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {capability}",
            )
        return payload

    return checker
