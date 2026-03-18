from pydantic import BaseModel


class RippleImportResult(BaseModel):
    type: str
    imported: int
    skipped: int


class RippleStats(BaseModel):
    resources: int
    moderations: int
