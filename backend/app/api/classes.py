from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.class_ import Class
from app.models.class_member import ClassMember
from app.models.user import User
from app.schemas.class_ import AddMemberRequest, ClassCreate, ClassDetailOut, ClassOut, ClassUpdate, MemberOut
from app.services.auth_service import get_current_user, require_staff

router = APIRouter(prefix="/classes", tags=["classes"])


# ---------------------------------------------------------------------------
# Authorization helpers
# ---------------------------------------------------------------------------


def _get_member(class_id: int, user: User, db: Session) -> ClassMember:
    """Return the ClassMember record or raise 403/404."""
    cls = db.get(Class, class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    member = (
        db.query(ClassMember)
        .filter(ClassMember.class_id == class_id, ClassMember.user_id == user.user_id)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of this class")
    return member


def _require_class_teacher(class_id: int, user: User, db: Session) -> ClassMember:
    member = _get_member(class_id, user, db)
    if member.role != "teacher":
        raise HTTPException(status_code=403, detail="Class teacher access required")
    return member


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ClassOut])
def list_classes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all classes the current user belongs to."""
    memberships = (
        db.query(ClassMember)
        .filter(ClassMember.user_id == current_user.user_id)
        .all()
    )
    class_ids = [m.class_id for m in memberships]
    return db.query(Class).filter(Class.id.in_(class_ids)).all()


@router.post("", response_model=ClassOut, status_code=201)
def create_class(
    body: ClassCreate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Create a new class. Caller is auto-added as a teacher."""
    cls = Class(
        name=body.name,
        description=body.description,
        created_by=current_user.user_id,
    )
    db.add(cls)
    db.flush()  # get cls.id before adding the member

    db.add(
        ClassMember(
            class_id=cls.id,
            user_id=current_user.user_id,
            role="teacher",
        )
    )
    db.commit()
    db.refresh(cls)
    return cls


@router.get("/{class_id}", response_model=ClassDetailOut)
def get_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return class detail with members and assignments."""
    _get_member(class_id, current_user, db)  # membership check
    cls = db.get(Class, class_id)

    members_out = []
    for m in cls.members:
        members_out.append(
            MemberOut(
                user_id=m.user.user_id,
                name=m.user.name,
                email=m.user.email,
                role=m.role,
            )
        )

    return ClassDetailOut(
        id=cls.id,
        name=cls.name,
        description=cls.description,
        created_by=cls.created_by,
        created_at=cls.created_at,
        members=members_out,
        assignments=cls.assignments,
    )


@router.patch("/{class_id}", response_model=ClassOut)
def update_class(
    class_id: int,
    body: ClassUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update class name and/or description. Requires class teacher."""
    _require_class_teacher(class_id, current_user, db)
    cls = db.get(Class, class_id)
    if body.name is not None:
        cls.name = body.name
    if body.description is not None:
        cls.description = body.description
    db.commit()
    db.refresh(cls)
    return cls


@router.delete("/{class_id}", status_code=204)
def delete_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a class and all its data. Requires class teacher."""
    _require_class_teacher(class_id, current_user, db)
    cls = db.get(Class, class_id)
    db.delete(cls)
    db.commit()


@router.post("/{class_id}/members", response_model=MemberOut, status_code=201)
def add_member(
    class_id: int,
    body: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a user to the class. Requires class teacher."""
    _require_class_teacher(class_id, current_user, db)

    target_user = db.query(User).filter(User.user_id == body.user_id).first()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(ClassMember)
        .filter(ClassMember.class_id == class_id, ClassMember.user_id == body.user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User already a member")

    member = ClassMember(class_id=class_id, user_id=body.user_id, role=body.role)
    db.add(member)
    db.commit()

    return MemberOut(
        user_id=target_user.user_id,
        name=target_user.name,
        email=target_user.email,
        role=body.role,
    )


@router.delete("/{class_id}/members/{user_id}", status_code=204)
def remove_member(
    class_id: int,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the class. Requires class teacher."""
    _require_class_teacher(class_id, current_user, db)

    member = (
        db.query(ClassMember)
        .filter(ClassMember.class_id == class_id, ClassMember.user_id == user_id)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()
