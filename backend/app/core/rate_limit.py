"""In-process login rate limiting.

This is intentionally dependency-free and per-worker. If the API is later run
with multiple workers and needs shared limits, swap the store for Redis or a
database-backed counter.
"""

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status

_attempts: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def check_login_rate_limit(
    key: str,
    *,
    max_attempts: int,
    window_seconds: int,
) -> None:
    now = monotonic()
    with _lock:
        bucket = _attempts[key]
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()

        if len(bucket) >= max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again later.",
            )

        bucket.append(now)


def clear_login_rate_limit(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)


def reset_login_rate_limits() -> None:
    """Used by tests to keep the limiter from leaking between cases."""
    with _lock:
        _attempts.clear()
