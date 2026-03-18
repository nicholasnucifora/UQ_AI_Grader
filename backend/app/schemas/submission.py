from datetime import datetime

from pydantic import BaseModel


class SubmissionCreate(BaseModel):
    content: str


class SubmissionOut(BaseModel):
    id: int
    assignment_id: int
    student_user_id: str
    content: str
    submitted_at: datetime

    model_config = {"from_attributes": True}
