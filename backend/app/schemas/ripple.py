from typing import Optional

from pydantic import BaseModel


class SkippedRow(BaseModel):
    resource_id: str
    reason: str
    detail: Optional[str] = None


class RippleImportResult(BaseModel):
    type: str
    imported: int
    skipped: int
    skipped_details: list[SkippedRow] = []


class RippleStats(BaseModel):
    resources: int
    moderations: int
