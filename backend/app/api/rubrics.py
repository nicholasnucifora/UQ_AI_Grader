import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.classes import _get_member, _require_class_teacher
from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.user import User
from app.schemas.rubric import RubricOut, RubricSave, RubricSchema
from app.services.ai_service import ai_service
from app.services.auth_service import get_current_user
from app.services.document_service import document_service

# ---------------------------------------------------------------------------
# Router 1: stateless ingest (no class/assignment context)
# ---------------------------------------------------------------------------

rubric_ingest_router = APIRouter(prefix="/rubrics", tags=["rubrics"])


@rubric_ingest_router.post("/ingest")
async def ingest_rubric(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
):
    """
    Accept a PDF, DOCX, or image upload, convert to Markdown via Docling,
    then extract a structured rubric via Claude Tool Use.
    Returns: { rubric, markdown_preview } on success, or { rubric: null, error } on failure.
    """
    file_bytes = await file.read()
    filename = file.filename or "upload.pdf"

    try:
        markdown = await document_service.extract_markdown(file_bytes, filename)
    except Exception as exc:
        return {"rubric": None, "markdown_preview": None, "error": str(exc)}

    try:
        rubric_dict = ai_service.extract_rubric(markdown)
        rubric = RubricSchema(**rubric_dict)
        markdown_preview = ai_service.format_rubric_to_markdown(rubric_dict)
        return {"rubric": rubric.model_dump(), "markdown_preview": markdown_preview}
    except Exception as exc:
        return {"rubric": None, "markdown_preview": markdown, "error": str(exc)}


# ---------------------------------------------------------------------------
# Router 2: CRUD nested under class + assignment
# Rubric is stored as a JSON envelope {"resource": {...}, "moderation": {...}}
# in the assignments.rubric_json column.
# ---------------------------------------------------------------------------

rubric_crud_router = APIRouter(
    prefix="/classes/{class_id}/assignments/{assignment_id}/rubric",
    tags=["rubrics"],
)


def _get_assignment_or_404(class_id: int, assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def _parse_rubric_out(assignment: Assignment) -> RubricOut | None:
    if not assignment.rubric_json:
        return None
    envelope = json.loads(assignment.rubric_json)
    resource_data = envelope.get("resource", envelope)
    moderation_data = envelope.get("moderation")
    return RubricOut(
        rubric=RubricSchema(**resource_data),
        moderation_rubric=RubricSchema(**moderation_data) if moderation_data else None,
    )


@rubric_crud_router.get("", response_model=RubricOut | None)
def get_rubric(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_member(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)
    return _parse_rubric_out(assignment)


@rubric_crud_router.post("", response_model=RubricOut, status_code=201)
def create_rubric(
    class_id: int,
    assignment_id: int,
    body: RubricSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)
    _save_rubric_json(assignment, body)
    db.commit()
    db.refresh(assignment)
    return _parse_rubric_out(assignment)


@rubric_crud_router.put("", response_model=RubricOut)
def update_rubric(
    class_id: int,
    assignment_id: int,
    body: RubricSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)
    _save_rubric_json(assignment, body)
    db.commit()
    db.refresh(assignment)
    return _parse_rubric_out(assignment)


def _save_rubric_json(assignment: Assignment, body: RubricSave) -> None:
    envelope = {
        "resource": body.rubric.model_dump(),
        "moderation": body.moderation_rubric.model_dump() if body.moderation_rubric else None,
    }
    assignment.rubric_json = json.dumps(envelope)
