import asyncio
import re
import secrets
import time
import uuid

import structlog
from fastapi import HTTPException
from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import cookie_parser
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import REQUEST_ID_HEADER, error_response
from app.core.security import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE

logger = structlog.get_logger("app.access")

_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


def _request_id(scope: Scope) -> str | None:
    return scope.get("state", {}).get("request_id")


class RequestContextMiddleware:
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
    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int,
        upload_max_bytes: int | None = None,
        upload_paths: re.Pattern[str] | None = None,
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.upload_max_bytes = upload_max_bytes or max_bytes
        self.upload_paths = upload_paths

    def _limit(self, path: str) -> int:
        if self.upload_paths is not None and self.upload_paths.fullmatch(path):
            return self.upload_max_bytes
        return self.max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit(scope["path"])
        content_length = Headers(scope=scope).get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > limit:
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
                if received > limit:
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, receive_limited, send)


class CsrfMiddleware:
    SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
    SESSION_COOKIES = (ACCESS_COOKIE, REFRESH_COOKIE)

    def __init__(
        self,
        app: ASGIApp,
        *,
        allowed_origin: str,
        always_protected_prefix: str,
        exempt_paths: frozenset[str] = frozenset(),
    ) -> None:
        self.app = app
        self.allowed_origin = allowed_origin
        self.always_protected_prefix = always_protected_prefix
        self.exempt_paths = exempt_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] in self.SAFE_METHODS
            or scope["path"] in self.exempt_paths
        ):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        cookies = cookie_parser(headers.get("cookie", ""))
        protected = scope["path"].startswith(self.always_protected_prefix) or any(
            name in cookies for name in self.SESSION_COOKIES
        )
        if (origin is not None and origin != self.allowed_origin) or (
            protected and not _tokens_match(cookies.get(CSRF_COOKIE), headers.get(CSRF_HEADER))
        ):
            logger.warning("csrf_failed", path=scope["path"], origin=origin)
            response = error_response(
                _request_id(scope), 403, "csrf_failed", "Missing or invalid CSRF token."
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


def _tokens_match(cookie: str | None, header: str | None) -> bool:
    if not cookie or not header:
        return False
    return secrets.compare_digest(cookie.encode(), header.encode())
