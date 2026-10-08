from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class AppError(Exception):
    """Base for expected errors. Services raise these; the API turns them into JSON."""

    status_code = 500
    code = "internal_error"
    message = "Internal server error."

    def __init__(self, message: str | None = None, *, code: str | None = None, details: Any = None):
        self.message = message or self.message
        self.code = code or self.code
        self.details = details
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    message = "Resource not found."


class ConflictError(AppError):
    status_code = 409
    code = "conflict"
    message = "The request conflicts with the current state of the resource."


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
    message = "You are not allowed to perform this action."


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    message = "Authentication required."


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"
    message = "The service is temporarily unavailable."


class BusinessRuleViolation(AppError):
    status_code = 422
    code = "business_rule_violation"
    message = "The request violates a business rule."


_HTTP_ERRORS: dict[int, tuple[str, str]] = {
    404: ("not_found", "Resource not found."),
    405: ("method_not_allowed", "Method not allowed."),
    413: ("payload_too_large", "Request body too large."),
}


def get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def error_response(
    request_id: str | None,
    status_code: int,
    code: str,
    message: str,
    *,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Uniform error body: {code, message, request_id[, details]}."""
    body: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
    if details is not None:
        body["details"] = details
    all_headers = dict(headers or {})
    if request_id:
        all_headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse(body, status_code=status_code, headers=all_headers)


async def _app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return error_response(
        get_request_id(request), exc.status_code, exc.code, exc.message, details=exc.details
    )


async def _http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code, message = _HTTP_ERRORS.get(exc.status_code, ("http_error", str(exc.detail)))
    return error_response(
        get_request_id(request), exc.status_code, code, message, headers=exc.headers
    )


async def _validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details = [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return error_response(
        get_request_id(request), 422, "validation_error", "Invalid request.", details=details
    )


async def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Runs in ServerErrorMiddleware (outside the app middlewares): log it here, with context.
    logger.error(
        "unhandled_error",
        request_id=get_request_id(request),
        method=request.method,
        path=request.url.path,
        exc_info=exc,
    )
    return error_response(get_request_id(request), 500, AppError.code, AppError.message)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
