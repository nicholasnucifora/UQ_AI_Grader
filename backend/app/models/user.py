from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """
    Canonical user record — populated from the x-kvd-payload header on every
    authenticated request.  Role is derived from the KVD ``groups`` list:
      uq:uqStaff   -> "staff"
      uq:uqStudent -> "student"
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="student")
    last_login: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
