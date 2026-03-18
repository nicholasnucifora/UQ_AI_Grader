from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClassMember(Base):
    __tablename__ = "class_members"
    __table_args__ = (UniqueConstraint("class_id", "user_id", name="uq_class_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default="student"
    )  # "teacher" | "student"
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    class_: Mapped["Class"] = relationship("Class", back_populates="members")  # noqa: F821
    user: Mapped["User"] = relationship("User")  # noqa: F821
