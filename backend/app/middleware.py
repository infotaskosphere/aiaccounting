"""
app/middleware.py
-----------------
Centralized error handling, request logging, and rate limiting.
All APIs return structured, meaningful responses.
"""
from __future__ import annotations

import time
import structlog
from collections import defaultdict
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = structlog.get_logger()

# ── Simple in-memory rate limiter ─────────────────────────────────────────────
# For production, replace with Redis-backed sliding window.
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_REQUESTS = 200
RATE_LIMIT_WINDOW   = 60   # seconds


def _is_rate_limited(client_ip: str) -> bool:
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    calls = _rate_store[client_ip]
    calls[:] = [t for t in calls if t > window_start]  # prune old
    if len(calls) >= RATE_LIMIT_REQUESTS:
        return True
    calls.append(now)
    return False


def register_middleware(app: FastAPI) -> None:
    """Register all middleware and exception handlers on the app."""

    # ── Request logging ────────────────────────────────────────────────────
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.time()
        response: Response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)
        log.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else "unknown",
        )
        response.headers["X-Response-Time"] = f"{duration_ms}ms"
        return response

    # ── Rate limiting ──────────────────────────────────────────────────────
    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        client_ip = request.client.host if request.client else "0.0.0.0"
        if _is_rate_limited(client_ip):
            return JSONResponse(
                status_code=429,
                content=_error_response(429, "Too many requests. Please slow down.", "RATE_LIMITED")
            )
        return await call_next(request)

    # ── HTTP exception handler ─────────────────────────────────────────────
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        log.warning("http_error", status=exc.status_code, detail=exc.detail, path=request.url.path)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_response(exc.status_code, str(exc.detail), "HTTP_ERROR")
        )

    # ── Validation error handler ───────────────────────────────────────────
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        errors = [
            {
                "field":   " → ".join(str(e) for e in err["loc"]),
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        log.warning("validation_error", errors=errors, path=request.url.path)
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error":   "Validation failed",
                "code":    "VALIDATION_ERROR",
                "details": errors,
            }
        )

    # ── General exception handler ──────────────────────────────────────────
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        log.error("unhandled_exception", error=str(exc), path=request.url.path, exc_info=True)
        return JSONResponse(
            status_code=500,
            content=_error_response(500, "An unexpected error occurred. Please try again.", "INTERNAL_ERROR")
        )


def _error_response(status: int, message: str, code: str) -> dict:
    return {
        "success": False,
        "error":   message,
        "code":    code,
        "status":  status,
    }


# ── v2 upgrade: request ID middleware for Docker/async compatibility ──────────
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Adds X-Request-ID header to every response."""
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
