from datetime import datetime

from pydantic import BaseModel


class CriterionGrade(BaseModel):
    criterion_id: str
    criterion_name: str
    level_id: str = ""
    level_title: str = ""
    points_awarded: float
    feedback: str


class GradingJobOut(BaseModel):
    id: int
    assignment_id: int
    status: str
    is_preview: bool = False
    preview_sample_size: int = 3
    total: int
    graded: int
    errors: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class GradeResultOut(BaseModel):
    id: int
    result_type: str
    ripple_resource_id: int
    ripple_moderation_id: int | None
    resource_id: str
    primary_author_name: str
    primary_author_id: str = ""
    # For moderation results: the user who wrote the moderation comment.
    moderation_user_id: str | None
    status: str
    criterion_grades: list[CriterionGrade]
    overall_feedback: str | None = None
    error_message: str | None
    graded_at: datetime
    # Topic(s) of the resource (single topic after CSV import filtering)
    resource_topics: str = ""
    # RiPPLE status of the resource (e.g. Approved, Removed, Needs Moderation)
    resource_status: str = ""
    # Resource content sections (for teacher grading panel)
    resource_sections: list = []
    # For moderation results: the moderation comment text
    moderation_comment: str | None = None
    # Teacher manual grading
    teacher_criterion_grades: list[CriterionGrade] | None = None
    teacher_overall_feedback: str | None = None
    teacher_graded_at: datetime | None = None
    teacher_graded_by: str | None = None

    model_config = {"from_attributes": True}


class TeacherGradeIn(BaseModel):
    criterion_grades: list[CriterionGrade]
