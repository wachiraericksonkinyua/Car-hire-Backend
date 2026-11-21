"""Central error handling for the whole API.

All errors return the same envelope and always include the request ID:

    {
      "success": false,
      "data": null,
      "error": {
        "code": "not_found",
        "message": "Vehicle not found",
        "details": null,
        "request_id": "..."
      }
    }
"""

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ErrorBody, ErrorEnvelope

logger = logging.getLogger("autohire.api")

# Human-readable error codes for the statuses the API actually uses.
_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "bad_gateway",
    503: "service_unavailable",
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "-")


def _error_response(
    request: Request,
    status_code: int,
    *,
    message: str,
    details=None,
) -> JSONResponse:
    envelope = ErrorEnvelope(
        error=ErrorBody(
            code=_STATUS_CODES.get(status_code, "http_error"),
            message=message,
            details=details,
            request_id=_request_id(request),
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(envelope),
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    if isinstance(exc.detail, str):
        message, details = exc.detail, None
    else:
        message, details = "Request failed", exc.detail

    return _error_response(
        request,
        exc.status_code,
        message=message,
        details=details,
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    # Keep only safe, serialisable fields — never echo the submitted value
    # (it may contain a phone number or ID).
    details = [
        {
            "loc": list(error.get("loc", [])),
            "msg": error.get("msg", "Invalid value"),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    logger.warning(
        "validation_error request_id=%s method=%s path=%s fields=%s",
        _request_id(request),
        request.method,
        request.url.path,
        details,
    )
    first = details[0] if details else None
    field = first["loc"][-1] if first and first["loc"] else None
    message = (
        f"Validation failed: {field} - {first['msg']}"
        if first and field
        else "Validation failed"
    )
    return _error_response(
        request,
        422,
        message=message,
        details=details,
    )


async def integrity_exception_handler(
    request: Request,
    exc: IntegrityError,
) -> JSONResponse:
    return _error_response(
        request,
        409,
        message="The request conflicts with existing data",
    )


async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    # Log only request metadata; never bodies, tokens, phones or ID numbers.
    logger.exception(
        "Unhandled error request_id=%s method=%s path=%s",
        _request_id(request),
        request.method,
        request.url.path,
    )
    return _error_response(
        request,
        500,
        message="Internal server error",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(IntegrityError, integrity_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
