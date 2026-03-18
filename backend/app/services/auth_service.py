"""
Core authentication service — 100% environment-agnostic.

All routes that require authentication call ``get_current_user`` as a FastAPI
dependency.  It reads the ``x-kvd-payload`` header, which is injected either:

  - Production : by the university's KVD reverse proxy
  - Development: by DevSessionInterceptorMiddleware (from a local session cookie)

The service has no knowledge of *how* that header arrived.
"""

import json
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User

# The single header name the entire app relies on.
KVD_HEADER = "x-kvd-payload"

# Maps KVD group strings to application roles.
_GROUP_TO_ROLE: dict[str, str] = {
    "uq:uqStaff": "staff",
    "uq:uqStudent": "student",
}


def _map_role(groups: list[str]) -> str:
    for group in groups:
        if group in _GROUP_TO_ROLE:
            return _GROUP_TO_ROLE[group]
    return "student"


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency.  Parses the KVD header, upserts the user record, and
    returns the ORM object.  Raises HTTP 401 for missing or malformed headers.
    """
    payload_str = request.headers.get(KVD_HEADER)
    if not payload_str:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = json.loads(payload_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Malformed auth payload")

    user_id = payload.get("user")
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Auth payload missing required 'user' field"
        )

    now = datetime.now(timezone.utc)
    user = db.query(User).filter(User.user_id == user_id).first()

    if user is None:
        user = User(
            user_id=user_id,
            name=payload.get("name", ""),
            email=payload.get("email", ""),
            role=_map_role(payload.get("groups", [])),
            last_login=now,
            created_at=now,
        )
        db.add(user)
    else:
        user.name = payload.get("name", user.name)
        # email is intentionally NOT overwritten here — teachers set their own
        # sender address via PATCH /auth/me and we must not clobber it on every request.
        groups = payload.get("groups")
        if groups is not None:
            user.role = _map_role(groups)
        user.last_login = now

    db.commit()
    db.refresh(user)
    return user


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Convenience dependency — raises HTTP 403 if the user is not staff."""
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user
