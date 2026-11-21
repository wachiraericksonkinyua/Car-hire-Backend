"""Request ID middleware.

Every request gets an ID (from a valid inbound `X-Request-ID` header or a new
UUID). The ID is available as `request.state.request_id`, is echoed in every
error envelope, and is returned in the `X-Request-ID` response header.
"""

import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


class RequestIDMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        inbound = request.headers.get("X-Request-ID")
        request_id = (
            inbound
            if inbound and _VALID_REQUEST_ID.fullmatch(inbound)
            else uuid.uuid4().hex
        )

        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
