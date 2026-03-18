"""
Local-development-only models.

MockUser  — stores hashed credentials and the KVD JSON payload to inject.
DevSession — maps a session cookie value to a MockUser; expires automatically.

These tables are created in development (ENV=development) and are never
referenced by any production code path.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MockUser(Base):
    __tablename__ = "mock_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    # Full JSON string in the production KVD payload format:
    # {"user": "...", "name": "...", "email": "...", "groups": [...]}
    kvd_payload: Mapped[str] = mapped_column(Text, nullable=False)

    sessions: Mapped[list["DevSession"]] = relationship(
        "DevSession", back_populates="mock_user", cascade="all, delete-orphan"
    )


class DevSession(Base):
    __tablename__ = "dev_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    mock_user_id: Mapped[int] = mapped_column(
        ForeignKey("mock_users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    mock_user: Mapped["MockUser"] = relationship(
        "MockUser", back_populates="sessions"
    )
