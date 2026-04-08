from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.grade import GradeResult
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentOut, AssignmentUpdate
from app.services.auth_service import get_current_user
from app.api.classes import _get_member, _require_class_teacher

router = APIRouter(
    prefix="/classes/{class_id}/assignments", tags=["assignments"]
)


@router.get("", response_model=list[AssignmentOut])
def list_assignments(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_member(class_id, current_user, db)
    assignments = db.query(Assignment).filter(Assignment.class_id == class_id).all()
    graded_ids = {
        row[0]
        for row in db.query(GradeResult.assignment_id)
        .filter(GradeResult.assignment_id.in_([a.id for a in assignments]))
        .distinct()
        .all()
    } if assignments else set()
    result = []
    for a in assignments:
        out = AssignmentOut.model_validate(a)
        out.has_grades = a.id in graded_ids
        result.append(out)
    return result


@router.post("", response_model=AssignmentOut, status_code=201)
def create_assignment(
    class_id: int,
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    assignment = Assignment(
        class_id=class_id,
        title=body.title,
        description=body.description,
        marking_criteria=body.marking_criteria,
        strictness=body.strictness,
        additional_notes=body.additional_notes,
        assignment_type=body.assignment_type,
        marking_mode=body.marking_mode,
        ai_model=body.ai_model,
        response_detail=body.response_detail,
        use_topic_attachments=body.use_topic_attachments,
        topic_attachment_instructions=body.topic_attachment_instructions,
        created_by=current_user.user_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentOut)
def get_assignment(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_member(class_id, current_user, db)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    has_grades = db.query(GradeResult.id).filter(GradeResult.assignment_id == assignment_id).first() is not None
    out = AssignmentOut.model_validate(assignment)
    out.has_grades = has_grades
    return out


@router.put("/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    class_id: int,
    assignment_id: int,
    body: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=204)
def delete_assignment(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()
