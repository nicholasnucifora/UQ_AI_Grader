from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.user import User
from app.schemas.submission import SubmissionCreate, SubmissionOut
from app.services.auth_service import get_current_user
from app.api.classes import _get_member

router = APIRouter(
    prefix="/classes/{class_id}/assignments/{assignment_id}/submissions",
    tags=["submissions"],
)


def _get_assignment(class_id: int, assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.get("", response_model=list[SubmissionOut])
def list_submissions(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = _get_member(class_id, current_user, db)
    _get_assignment(class_id, assignment_id, db)

    query = db.query(Submission).filter(Submission.assignment_id == assignment_id)
    if member.role != "teacher":
        query = query.filter(Submission.student_user_id == current_user.user_id)

    return query.all()


@router.post("", response_model=SubmissionOut, status_code=201)
def create_submission(
    class_id: int,
    assignment_id: int,
    body: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = _get_member(class_id, current_user, db)
    if member.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit")

    _get_assignment(class_id, assignment_id, db)

    existing = (
        db.query(Submission)
        .filter(
            Submission.assignment_id == assignment_id,
            Submission.student_user_id == current_user.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="You have already submitted for this assignment"
        )

    submission = Submission(
        assignment_id=assignment_id,
        student_user_id=current_user.user_id,
        content=body.content,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    class_id: int,
    assignment_id: int,
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = _get_member(class_id, current_user, db)
    _get_assignment(class_id, assignment_id, db)

    submission = db.get(Submission, submission_id)
    if submission is None or submission.assignment_id != assignment_id:
        raise HTTPException(status_code=404, detail="Submission not found")

    if member.role != "teacher" and submission.student_user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return submission
