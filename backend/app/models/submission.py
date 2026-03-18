from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint(
            "assignment_id", "student_user_id", name="uq_submission_per_student"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id"), nullable=False
    )
    student_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    assignment: Mapped["Assignment"] = relationship(  # noqa: F821
        "Assignment", back_populates="submissions"
    )
    student: Mapped["User"] = relationship("User")  # noqa: F821
