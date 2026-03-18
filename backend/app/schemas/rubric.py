from pydantic import BaseModel


class RubricLevel(BaseModel):
    id: str
    title: str
    points: float
    description: str


class RubricCriterion(BaseModel):
    id: str
    name: str
    weight_percentage: float
    levels: list[RubricLevel]


class RubricSchema(BaseModel):
    title: str
    criteria: list[RubricCriterion]


class RubricSave(BaseModel):
    rubric: RubricSchema
    moderation_rubric: RubricSchema | None = None


class RubricOut(BaseModel):
    rubric: RubricSchema
    moderation_rubric: RubricSchema | None = None
