from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RippleResource(Base):
    __tablename__ = "ripple_resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    resource_id: Mapped[str] = mapped_column(String(256), nullable=False)
    primary_author_id: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    primary_author_name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    resource_type: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    resource_status: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    topics: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    assignment: Mapped["Assignment"] = relationship("Assignment")  # noqa: F821


class RippleModeration(Base):
    __tablename__ = "ripple_moderations"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    resource_id: Mapped[str] = mapped_column(String(256), nullable=False)
    user_id: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    rubric_scores: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    assignment: Mapped["Assignment"] = relationship("Assignment")  # noqa: F821
