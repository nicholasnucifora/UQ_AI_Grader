from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
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
    # Feedback detail level: "concise" | "standard" | "detailed"
    response_detail: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    # Topic attachment settings
    use_topic_attachments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    topic_attachment_instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Rubric stored as JSON envelope {"resource": {...}, "moderation": {...}} (migration 3f2f0ece9f62)
    rubric_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
