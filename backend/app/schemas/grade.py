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
    preview_type: str | None = None
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
    job_id: int | None = None
    result_type: str
    ripple_resource_id: int
    ripple_moderation_id: int | None
    resource_id: str
    primary_author_name: str
    primary_author_id: str = ""
    # For moderation results: the user who wrote the moderation comment.
    moderation_user_id: str | None
    moderation_user_name: str | None = None
    status: str
    criterion_grades: list[CriterionGrade]
    overall_feedback: str | None = None
    error_message: str | None
    graded_at: datetime
    created_at: datetime | None = None
    # Topic(s) of the resource (single topic after CSV import filtering)
    resource_topics: str = ""
    # RiPPLE status of the resource (e.g. Approved, Removed, Needs Moderation)
    resource_status: str = ""
    # Resource content sections (for teacher grading panel)
    resource_sections: list = []
    # For moderation results: the moderation comment text
    moderation_comment: str | None = None
    # Submission date from the RiPPLE CSV (Timestamp for resources, Created At for moderations)
    submission_date: str | None = None
    # Teacher manual grading
    rubric_max_points_json: dict | None = None
    teacher_criterion_grades: list[CriterionGrade] | None = None
    teacher_overall_feedback: str | None = None
    teacher_graded_at: datetime | None = None
    teacher_graded_by: str | None = None
    # Late submission tracking
    is_late: bool = False
    has_extension: bool = False
    seconds_late: int | None = None

    model_config = {"from_attributes": True}


class TeacherGradeIn(BaseModel):
    criterion_grades: list[CriterionGrade]


class RedoGradeIn(BaseModel):
    amendment: str | None = None
