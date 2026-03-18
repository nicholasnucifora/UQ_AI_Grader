from datetime import datetime
from typing import Literal

from pydantic import BaseModel


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
    use_topic_attachments: bool = False
    topic_attachment_instructions: str = ""


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
    use_topic_attachments: bool | None = None
    topic_attachment_instructions: str | None = None


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
    use_topic_attachments: bool = False
    topic_attachment_instructions: str = ""
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
