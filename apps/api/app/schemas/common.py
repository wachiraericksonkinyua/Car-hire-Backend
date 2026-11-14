"""Shared API response envelope.

Every response — success or error — uses the same outer shape:

    {"success": true,  "data": ..., "error": null}
    {"success": false, "data": null, "error": {...}}

`SuccessEnvelope[T]` is used as a route's `response_model` so OpenAPI documents
the real payload. Error envelopes are produced centrally by the exception
handlers in `app/core/errors.py`.
"""

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None
    request_id: str


class SuccessEnvelope(BaseModel, Generic[T]):
    success: Literal[True] = True
    data: T
    error: None = None


class ErrorEnvelope(BaseModel):
    success: Literal[False] = False
    data: None = None
    error: ErrorBody
