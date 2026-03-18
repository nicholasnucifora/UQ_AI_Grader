from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    members: Mapped[list["ClassMember"]] = relationship(  # noqa: F821
        "ClassMember", back_populates="class_", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(  # noqa: F821
        "Assignment", back_populates="class_", cascade="all, delete-orphan"
    )
