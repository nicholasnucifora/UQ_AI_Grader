"""
Authentication API routes.

/auth/me           — Always available; returns the current user derived from the
                     x-kvd-payload header (injected by proxy or dev middleware).

/auth/local-login  — Development only.  Accepts username + password, issues a
/auth/local-logout   session cookie that the DevSessionInterceptorMiddleware
                     exchanges for the KVD header on subsequent requests.

/auth/local-login  GET  — Renders a minimal HTML login form (dev convenience).
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.dev_session import DevSession, MockUser
from app.models.user import User
from app.schemas.auth import CurrentUser, LocalLoginRequest, LocalRegisterRequest
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Production-compatible endpoint — works in both environments
# ---------------------------------------------------------------------------


@router.get("/me", response_model=CurrentUser)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return {
        "user_id": current_user.user_id,
        "name": current_user.name,
        "role": current_user.role,
        "student_email_domain": settings.student_email_domain,
    }


# ---------------------------------------------------------------------------
# Development-only endpoints
# ---------------------------------------------------------------------------


def _require_dev():
    """Dependency that aborts with 404 when called outside development."""
    if settings.env != "development":
        raise HTTPException(status_code=404, detail="Not found")


@router.get(
    "/local-login",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_dev)],
    include_in_schema=False,
)
def local_login_page():
    """Render a minimal login form for local development."""
    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Dev Login — AI Ripple Grader</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center;
           padding-top: 80px; background: #f5f5f5; margin: 0; }
    .card { background: #fff; padding: 2rem; border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,.12); width: 320px; }
    h2 { margin: 0 0 1.5rem; font-size: 1.2rem; color: #333; }
    label { display: block; margin-bottom: .25rem; font-size: .85rem; color: #555; }
    input { width: 100%; box-sizing: border-box; padding: .5rem .75rem;
            border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem;
            font-size: 1rem; }
    button { width: 100%; padding: .6rem; background: #2563eb; color: #fff;
             border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .note { margin-top: 1rem; font-size: .75rem; color: #888; text-align: center; }
    #msg { margin-bottom: .75rem; color: red; font-size: .85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Dev Login</h2>
    <div id="msg"></div>
    <form id="form">
      <label>Username</label>
      <input name="username" autocomplete="username" />
      <label>Password</label>
      <input name="password" type="password" autocomplete="current-password" />
      <button type="submit">Log in</button>
    </form>
    <p class="note">Development environment only &mdash; <a href="/auth/local-register">Register a new account</a></p>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const res = await fetch('/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/auth/me';
      } else {
        const body = await res.json();
        document.getElementById('msg').textContent =
          body.detail || 'Login failed';
      }
    });
  </script>
</body>
</html>"""
    )


@router.post("/local-login", dependencies=[Depends(_require_dev)])
def local_login(
    body: LocalLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Validate mock credentials, create a DevSession, and set the session cookie.

    The DevSessionInterceptorMiddleware will pick up this cookie on subsequent
    requests and inject the corresponding x-kvd-payload header.
    """
    mock_user = (
        db.query(MockUser).filter(MockUser.username == body.username).first()
    )
    if not mock_user or not bcrypt.checkpw(
        body.password.encode(), mock_user.hashed_password.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.session_ttl_hours)

    db.add(
        DevSession(
            session_id=session_id,
            mock_user_id=mock_user.id,
            created_at=now,
            expires_at=expires_at,
        )
    )
    db.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=int(timedelta(hours=settings.session_ttl_hours).total_seconds()),
        # secure=False: local dev has no HTTPS; set secure=True in production
        secure=False,
    )
    return {"detail": "Logged in"}


@router.post("/local-logout", dependencies=[Depends(_require_dev)])
def local_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Invalidate the current dev session and clear the cookie."""
    session_id = request.cookies.get(settings.session_cookie_name)
    if session_id:
        db.query(DevSession).filter(
            DevSession.session_id == session_id
        ).delete()
        db.commit()
    response.delete_cookie(key=settings.session_cookie_name)
    return {"detail": "Logged out"}


_ROLE_TO_GROUP = {"staff": "uq:uqStaff", "student": "uq:uqStudent"}


@router.get(
    "/local-register",
    response_class=HTMLResponse,
    dependencies=[Depends(_require_dev)],
    include_in_schema=False,
)
def local_register_page():
    """Render a registration form for creating local dev accounts."""
    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Dev Register — AI Ripple Grader</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center;
           padding-top: 60px; background: #f5f5f5; margin: 0; }
    .card { background: #fff; padding: 2rem; border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,.12); width: 320px; }
    h2 { margin: 0 0 1.5rem; font-size: 1.2rem; color: #333; }
    label { display: block; margin-bottom: .25rem; font-size: .85rem; color: #555; }
    input, select { width: 100%; box-sizing: border-box; padding: .5rem .75rem;
            border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem;
            font-size: 1rem; background: #fff; }
    button { width: 100%; padding: .6rem; background: #16a34a; color: #fff;
             border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #15803d; }
    .note { margin-top: 1rem; font-size: .75rem; color: #888; text-align: center; }
    #msg { margin-bottom: .75rem; font-size: .85rem; }
    #msg.error { color: red; }
    #msg.success { color: green; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Dev Register</h2>
    <div id="msg"></div>
    <form id="form">
      <label>Username</label>
      <input name="username" autocomplete="username" />
      <label>Password</label>
      <input name="password" type="password" autocomplete="new-password" />
      <label>Display name</label>
      <input name="name" placeholder="Jane Smith" />
      <label>Email</label>
      <input name="email" type="email" placeholder="jane@example.com" />
      <label>Role</label>
      <select name="role">
        <option value="student">Student</option>
        <option value="staff">Staff</option>
      </select>
      <button type="submit">Create account</button>
    </form>
    <p class="note">Development environment only &mdash; <a href="/auth/local-login">Back to login</a></p>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = document.getElementById('msg');
      const data = Object.fromEntries(new FormData(e.target));
      const res = await fetch('/auth/local-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const body = await res.json();
      if (res.ok) {
        msg.className = 'success';
        msg.textContent = 'Account created — redirecting to login…';
        setTimeout(() => window.location.href = '/auth/local-login', 1200);
      } else {
        msg.className = 'error';
        msg.textContent = body.detail || 'Registration failed';
      }
    });
  </script>
</body>
</html>"""
    )


@router.post("/local-register", dependencies=[Depends(_require_dev)])
def local_register(
    body: LocalRegisterRequest,
    db: Session = Depends(get_db),
):
    """Create a new mock dev account."""
    if db.query(MockUser).filter(MockUser.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    group = _ROLE_TO_GROUP[body.role]
    kvd_payload = json.dumps({
        "user": body.username,
        "name": body.name,
        "email": body.email,
        "groups": [group],
    })

    db.add(MockUser(
        username=body.username,
        hashed_password=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        kvd_payload=kvd_payload,
    ))
    db.commit()
    return {"detail": "Account created"}
