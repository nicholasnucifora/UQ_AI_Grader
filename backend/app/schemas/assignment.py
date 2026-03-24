from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class AssignmentCreate(BaseModel):
    title: str
    description: str = ""
    marking_criteria: str = ""
    strictness: Literal["lenient", "standard", "strict"] = "standard"
    additional_notes: str = ""
    assignment_type: str = "resources"
    marking_mode: Literal["teacher_supervised_ai", "teacher_marking"] = "teacher_supervised_ai"
    ai_model: str = "haiku"
    response_detail: Literal["concise", "standard", "detailed"] = "standard"
    feedback_format: str = ""
    use_topic_attachments: bool = False
    topic_attachment_instructions: str = ""
    moderation_topic_attachment_instructions: str = ""
    grade_scale_enabled: bool = False
    grade_scale_max: float | None = None
    grade_rounding: str = "none"
    grade_decimal_places: int = 2
    separate_moderation_grade_scale: bool = False
    moderation_grade_scale_max: float | None = None
    moderation_grade_rounding: str = "none"
    moderation_grade_decimal_places: int = 2
    combine_resource_grades: bool = False
    combine_moderation_grades: bool = False
    combine_resource_max_n: int | None = None
    combine_moderation_max_n: int | None = None
    combine_scope: str = "topic"
    topic_instruction_overrides: dict = {}


class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    marking_criteria: str | None = None
    strictness: Literal["lenient", "standard", "strict"] | None = None
    additional_notes: str | None = None
    assignment_type: str | None = None
    same_rubric_for_moderation: bool | None = None
    same_ai_options_for_moderation: bool | None = None
    moderation_strictness: str | None = None
    moderation_additional_notes: str | None = None
    marking_mode: Literal["teacher_supervised_ai", "teacher_marking"] | None = None
    ai_model: str | None = None
    response_detail: Literal["concise", "standard", "detailed"] | None = None
    feedback_format: str | None = None
    use_topic_attachments: bool | None = None
    topic_attachment_instructions: str | None = None
    moderation_topic_attachment_instructions: str | None = None
    grade_scale_enabled: bool | None = None
    grade_scale_max: float | None = None
    grade_rounding: str | None = None
    grade_decimal_places: int | None = None
    separate_moderation_grade_scale: bool | None = None
    moderation_grade_scale_max: float | None = None
    moderation_grade_rounding: str | None = None
    moderation_grade_decimal_places: int | None = None
    combine_resource_grades: bool | None = None
    combine_moderation_grades: bool | None = None
    combine_resource_max_n: int | None = None
    combine_moderation_max_n: int | None = None
    combine_scope: str | None = None
    topic_instruction_overrides: dict | None = None


class AssignmentOut(BaseModel):
    id: int
    class_id: int
    title: str
    description: str
    marking_criteria: str
    strictness: str
    additional_notes: str
    assignment_type: str = "resources"
    same_rubric_for_moderation: bool = True
    same_ai_options_for_moderation: bool = True
    moderation_strictness: str | None = None
    moderation_additional_notes: str | None = None
    marking_mode: str = "teacher_supervised_ai"
    ai_model: str = "haiku"
    response_detail: str = "standard"
    feedback_format: str = ""
    use_topic_attachments: bool = False
    topic_attachment_instructions: str = ""
    moderation_topic_attachment_instructions: str = ""
    grade_scale_enabled: bool = False
    grade_scale_max: float | None = None
    grade_rounding: str = "none"
    grade_decimal_places: int = 2
    separate_moderation_grade_scale: bool = False
    moderation_grade_scale_max: float | None = None
    moderation_grade_rounding: str = "none"
    moderation_grade_decimal_places: int = 2
    combine_resource_grades: bool = False
    combine_moderation_grades: bool = False
    combine_resource_max_n: int | None = None
    combine_moderation_max_n: int | None = None
    combine_scope: str = "topic"
    topic_instruction_overrides: dict = {}
    created_by: str
    created_at: datetime

    @field_validator("topic_instruction_overrides", mode="before")
    @classmethod
    def coerce_none_to_empty_dict(cls, v):
        return v if v is not None else {}

    model_config = {"from_attributes": True}
