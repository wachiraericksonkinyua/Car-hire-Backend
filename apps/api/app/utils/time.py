"""UTC datetime helpers.

The database stores TIMESTAMPTZ. Python values should always be timezone-aware
UTC, and the API returns ISO-8601 strings with a `Z` suffix.
"""

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Attach UTC to a naive value, or convert an aware value to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_iso(value: datetime) -> str:
    """Serialise a datetime as UTC ISO-8601 with a `Z` suffix."""
    return as_utc(value).isoformat().replace("+00:00", "Z")
