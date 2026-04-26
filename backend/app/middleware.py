"""
Middleware — CORS, request ID, timing, error formatting
"""
from __future__ import annotations
import logging
import time
import uuid

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        start = time.perf_counter()
        request.state.request_id = request_id

        try:
            response: Response = await call_next(request)
        except Exception as exc:
            log.exception("Unhandled error [%s] %s %s", request_id, request.method, request.url)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )

        elapsed = (time.perf_counter() - start) * 1000
        log.info(
            "[%s] %s %s → %d (%.1fms)",
            request_id, request.method, request.url.path,
            response.status_code, elapsed,
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"
        return response
