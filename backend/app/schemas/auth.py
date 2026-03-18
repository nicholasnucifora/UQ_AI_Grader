from typing import Literal

from pydantic import BaseModel


class LocalLoginRequest(BaseModel):
    username: str
    password: str


class LocalRegisterRequest(BaseModel):
    username: str
    password: str
    name: str
    email: str
    role: Literal["staff", "student"]


class CurrentUser(BaseModel):
    user_id: str
    name: str
    role: str
    student_email_domain: str = ""

    model_config = {"from_attributes": True}


