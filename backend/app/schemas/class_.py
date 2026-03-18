from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.assignment import AssignmentOut


class ClassCreate(BaseModel):
    name: str
    description: str = ""


class ClassOut(BaseModel):
    id: int
    name: str
    description: str
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class ClassDetailOut(ClassOut):
    members: list[MemberOut] = []
    assignments: list[AssignmentOut] = []


class ClassUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class AddMemberRequest(BaseModel):
    user_id: str
    role: Literal["teacher", "student"]
