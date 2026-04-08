from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GradingJob(Base):
    __tablename__ = "grading_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    is_preview: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preview_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    preview_sample_size: Mapped[int] = mapped_column(nullable=False, default=3)
    # Pre-computed list of RippleResource/RippleModeration PKs to grade in preview.
    # Computed in the API endpoint (where the session reliably sees all data) so the
    # background task doesn't need to re-query done_resource_ids.
    preview_item_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    total: Mapped[int] = mapped_column(nullable=False, default=0)
    graded: Mapped[int] = mapped_column(nullable=False, default=0)
    errors: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assignment: Mapped["Assignment"] = relationship("Assignment")  # noqa: F821


class GradeResult(Base):
    __tablename__ = "grade_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("grading_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # For resource grades: the resource being graded.
    # For moderation grades: the original resource that was moderated (for context).
    ripple_resource_id: Mapped[int] = mapped_column(
        ForeignKey("ripple_resources.id", ondelete="CASCADE"), nullable=False
    )
    # Set only for moderation grades.
    ripple_moderation_id: Mapped[int | None] = mapped_column(
        ForeignKey("ripple_moderations.id", ondelete="CASCADE"), nullable=True
    )
    result_type: Mapped[str] = mapped_column(String(32), nullable=False, default="resource")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    criterion_grades: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # Rubric max points snapshot at grading time: {criterion_id: max_points}
    rubric_max_points_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Teacher manual grading fields
    teacher_criterion_grades: Mapped[list | None] = mapped_column(JSON, nullable=True)
    teacher_overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    teacher_graded_by: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # When this result row was first created (not updated). Used to distinguish
    # submissions that existed during a grading run from ones imported afterwards.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    assignment: Mapped["Assignment"] = relationship("Assignment")  # noqa: F821
    ripple_resource: Mapped["RippleResource"] = relationship("RippleResource")  # noqa: F821
