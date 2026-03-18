"""
Dev-Mode KVD Interceptor Middleware
====================================
ONLY registered when ENV=development.  Never imported or executed in production.

Flow
----
1. Read the ``dev_session_id`` cookie from the incoming request.
2. Validate the session against the ``dev_sessions`` table (checks expiry).
3. Load the associated MockUser's ``kvd_payload`` JSON string.
4. Inject that string as the ``x-kvd-payload`` header into the ASGI request
   scope so downstream route handlers see it identically to the production proxy.

The DB call is dispatched to a thread pool to avoid blocking the async event
loop (important even for local SQLite).
"""

import logging

from datetime import datetime, timezone

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.dev_session import DevSession
from app.services.auth_service import KVD_HEADER

logger = logging.getLogger(__name__)


class DevSessionInterceptorMiddleware(BaseHTTPMiddleware):
    """
    Bridges the stateful local session cookie to the stateless KVD header
    expected by the core application.

    This middleware is conditionally added to the ASGI stack in main.py:

        if settings.env == "development":
            app.add_middleware(DevSessionInterceptorMiddleware)

    In production the block is never reached, so this class is never
    instantiated and the KVD header can only arrive from the university proxy.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        session_id = request.cookies.get(settings.session_cookie_name)
        if session_id:
            payload_json = await run_in_threadpool(
                _resolve_payload_from_session, session_id
            )
            if payload_json:
                # Mutate the ASGI scope's header list in-place.
                # MutableHeaders writes back to scope["headers"] directly, so
                # the Request object built downstream will see the new header.
                headers = MutableHeaders(scope=request.scope)
                headers[KVD_HEADER] = payload_json

        return await call_next(request)


def _resolve_payload_from_session(session_id: str) -> str | None:
    """
    Synchronous DB lookup — runs in a thread pool via run_in_threadpool.

    Returns the MockUser's kvd_payload string, or None if the session is
    missing, expired, or the lookup fails.
    """
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        session = (
            db.query(DevSession)
            .filter(
                DevSession.session_id == session_id,
                DevSession.expires_at > now,
            )
            .first()
        )
        if session is None:
            return None
        return session.mock_user.kvd_payload
    except Exception:
        logger.exception("DevSessionInterceptorMiddleware: session lookup failed")
        return None
    finally:
        db.close()
