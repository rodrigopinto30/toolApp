"""Pure ASGI middlewares (no BaseHTTPMiddleware: it breaks contextvars and streaming)."""

import asyncio
import re
import time
import uuid

import structlog
from fastapi import HTTPException
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import REQUEST_ID_HEADER, error_response

logger = structlog.get_logger("app.access")

_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


def _request_id(scope: Scope) -> str | None:
    return scope.get("state", {}).get("request_id")


class RequestContextMiddleware:
    """Sets the request id (nginx's X-Request-ID or a new one), binds it to every log line,
    returns it in the response and writes the access log."""

    def __init__(self, app: ASGIApp, *, quiet_paths: frozenset[str] = frozenset()) -> None:
        self.app = app
        self.quiet_paths = quiet_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER)
        valid = incoming is not None and _VALID_REQUEST_ID.fullmatch(incoming)
        request_id = incoming if valid else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        status_code = 500
        started = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                if REQUEST_ID_HEADER not in headers:
                    headers.append(REQUEST_ID_HEADER, request_id)
            await send(message)

        with structlog.contextvars.bound_contextvars(request_id=request_id):
            try:
                await self.app(scope, receive, send_with_request_id)
            finally:
                if scope["path"] not in self.quiet_paths:
                    logger.info(
                        "request",
                        method=scope["method"],
                        path=scope["path"],
                        status=status_code,
                        duration_ms=round((time.perf_counter() - started) * 1000, 2),
                    )


class CacheControlMiddleware:
    """API responses are private by default: `Cache-Control: no-store` unless the endpoint
    sets its own Cache-Control (the public catalog will)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_cache_control(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if "cache-control" not in headers:
                    headers.append("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_with_cache_control)


class TimeoutMiddleware:
    """Cancels requests that take longer than `timeout` seconds and answers 504."""

    def __init__(self, app: ASGIApp, *, timeout: float) -> None:
        self.app = app
        self.timeout = timeout

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_tracking(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        deadline = asyncio.timeout(self.timeout)
        try:
            async with deadline:
                await self.app(scope, receive, send_tracking)
        except TimeoutError:
            if not deadline.expired() or response_started:
                raise
            logger.warning("request_timeout", path=scope["path"], timeout_s=self.timeout)
            response = error_response(
                _request_id(scope), 504, "timeout", "The request took too long to complete."
            )
            await response(scope, receive, send)


class BodySizeLimitMiddleware:
    """Rejects bodies larger than `max_bytes` with 413, by Content-Length or while streaming."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > self.max_bytes:
            response = error_response(
                _request_id(scope), 413, "payload_too_large", "Request body too large."
            )
            await response(scope, receive, send)
            return

        received = 0

        async def receive_limited() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, receive_limited, send)
