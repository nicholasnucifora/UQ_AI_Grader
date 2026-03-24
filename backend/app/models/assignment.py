from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    marking_criteria: Mapped[str] = mapped_column(Text, nullable=False, default="")
    strictness: Mapped[str] = mapped_column(
        String(16), nullable=False, default="standard"
    )  # "lenient" | "standard" | "strict"
    additional_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Assignment type + moderation settings (migration 4ac08da428b9)
    assignment_type: Mapped[str] = mapped_column(String(32), nullable=False, default="resources")
    same_rubric_for_moderation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    same_ai_options_for_moderation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    moderation_strictness: Mapped[str | None] = mapped_column(String(16), nullable=True)
    moderation_additional_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Marking mode: "teacher_supervised_ai" | "teacher_marking" (migration auto)
    marking_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="teacher_supervised_ai")
    # AI model tier: "haiku" | "sonnet" | "opus" — resolved to actual model ID via settings
    ai_model: Mapped[str] = mapped_column(String(64), nullable=False, default="haiku")
    # Feedback detail level: "concise" | "standard" | "detailed" (kept for legacy, unused)
    response_detail: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    # Free-text feedback format instruction sent to the AI
    feedback_format: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    # Topic attachment settings
    use_topic_attachments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    topic_attachment_instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    moderation_topic_attachment_instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Per-topic instruction overrides: {topic_name: instruction_string} — overrides global topic_attachment_instructions
    topic_instruction_overrides: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    # Rubric stored as JSON envelope {"resource": {...}, "moderation": {...}} (migration 3f2f0ece9f62)
    rubric_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Grade scaling — convert raw rubric score to a custom grade range (migration c1d2e3f4a5b6)
    grade_scale_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    grade_scale_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    grade_rounding: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    # "none" | "round" | "round_up" | "round_down" | "half" (nearest 0.5)
    grade_decimal_places: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # Optional separate grade scale for moderation results (migration e3f4a5b6c7d8)
    separate_moderation_grade_scale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    moderation_grade_scale_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    moderation_grade_rounding: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    moderation_grade_decimal_places: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # Combined overall grade per student (average across all submissions of that type)
    combine_resource_grades: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    combine_moderation_grades: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Max submissions counted per student (null = no limit, use simple average)
    # When set to N: best N scores taken, divided by N (missing = 0 contribution)
    combine_resource_max_n: Mapped[int | None] = mapped_column(Integer, nullable=True)
    combine_moderation_max_n: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Whether combined grade is computed per-topic or across the whole assignment
    combine_scope: Mapped[str] = mapped_column(String(16), nullable=False, default="topic")
    # "topic" | "assignment"
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    class_: Mapped["Class"] = relationship("Class", back_populates="assignments")  # noqa: F821
    submissions: Mapped[list["Submission"]] = relationship(  # noqa: F821
        "Submission", back_populates="assignment", cascade="all, delete-orphan"
    )
