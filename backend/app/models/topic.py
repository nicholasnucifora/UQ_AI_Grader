from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TopicAttachment(Base):
    __tablename__ = "topic_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    assignment: Mapped["Assignment"] = relationship("Assignment")  # noqa: F821
