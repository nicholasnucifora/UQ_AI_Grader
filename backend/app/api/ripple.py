import csv

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.classes import _require_class_teacher
from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.ripple import RippleModeration, RippleResource
from app.models.user import User
from app.schemas.ripple import RippleImportResult, RippleStats
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/classes/{class_id}/assignments/{assignment_id}/ripple",
    tags=["ripple"],
)


def _get_assignment_or_404(class_id: int, assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.post("/import", response_model=RippleImportResult)
async def import_ripple_csv(
    class_id: int,
    assignment_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a RiPPLE resource or moderation CSV export.
    Type is auto-detected from column headers.
    Replaces any existing rows of that type for this assignment.
    """
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)

    content = await file.read()
    # Try common encodings; RiPPLE exports may vary
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(status_code=400, detail="Could not decode CSV file — unsupported encoding")

    lines = text.splitlines()

    # Skip the first two header rows (Start Date / End Date metadata)
    if len(lines) < 3:
        raise HTTPException(status_code=400, detail="CSV file too short to parse")

    reader = csv.DictReader(lines[2:])
    rows = list(reader)
    fieldnames = reader.fieldnames or []

    # Auto-detect type
    if "Topics" in fieldnames:
        csv_type = "resource"
    elif "Topic IDs" in fieldnames:
        csv_type = "moderation"
    else:
        raise HTTPException(
            status_code=400,
            detail="Could not detect CSV type — expected 'Topics' (resource) or 'Topic IDs' (moderation) column",
        )

    ALLOWED_RESOURCE_STATUSES = {"Approved", "Removed", "Needs Moderation"}

    if csv_type == "resource":
        # Load existing resource_ids to avoid duplicates
        existing_ids = {
            r.resource_id
            for r in db.query(RippleResource.resource_id)
            .filter(RippleResource.assignment_id == assignment.id)
            .all()
        }

        section_cols = [f for f in fieldnames if f.startswith("Section ")]
        records = []
        skipped = 0
        for row in rows:
            topics = row.get("Topics") or ""
            status = row.get("Resource Status") or ""
            sections = [row[col] for col in section_cols if (row.get(col) or "").strip()]
            resource_id = row.get("Resource ID") or ""

            # Skip multi-topic rows
            if "," in topics:
                skipped += 1
                continue
            # Skip rows with no submitted content
            if not sections:
                skipped += 1
                continue
            # Skip statuses that aren't meaningful for grading
            if status not in ALLOWED_RESOURCE_STATUSES:
                skipped += 1
                continue
            # Skip duplicates already in DB
            if resource_id in existing_ids:
                skipped += 1
                continue

            existing_ids.add(resource_id)
            records.append(
                RippleResource(
                    assignment_id=assignment.id,
                    resource_id=resource_id,
                    primary_author_id=row.get("Primary Author ID") or "",
                    primary_author_name=" ".join(filter(None, [
                        (row.get("Primary Author First Name") or "").strip(),
                        (row.get("Primary Author Last Name") or "").strip(),
                    ])) or row.get("Primary Author") or "",
                    resource_type=row.get("Resource Type") or "",
                    resource_status=status,
                    topics=topics,
                    sections=sections,
                )
            )
        db.add_all(records)
        db.commit()
        return RippleImportResult(type="resource", imported=len(records), skipped=skipped)

    else:  # moderation
        # Load existing (resource_id, user_id) pairs to avoid duplicates
        existing_pairs = {
            (r.resource_id, r.user_id)
            for r in db.query(RippleModeration.resource_id, RippleModeration.user_id)
            .filter(RippleModeration.assignment_id == assignment.id)
            .all()
        }

        rubric_cols = [f for f in fieldnames if f.startswith("Rubric ")]
        records = []
        skipped = 0
        for row in rows:
            topic_ids = row.get("Topic IDs") or ""
            role = row.get("Role") or ""
            comment = (row.get("Comment") or "").strip()
            resource_id = row.get("Resource ID") or ""
            user_id = row.get("User Course ID") or row.get("User ID") or ""

            # Skip multi-topic rows
            if "," in topic_ids:
                skipped += 1
                continue
            # Skip non-moderator rows (e.g. student peer reviews)
            if role.lower() != "moderator":
                skipped += 1
                continue
            # Skip rows with no comment
            if not comment:
                skipped += 1
                continue
            # Skip duplicates already in DB
            if (resource_id, user_id) in existing_pairs:
                skipped += 1
                continue

            existing_pairs.add((resource_id, user_id))
            rubric_scores = {col: row.get(col) or "" for col in rubric_cols}
            user_name = " ".join(filter(None, [
                (row.get("First Name") or "").strip(),
                (row.get("Last Name") or "").strip(),
            ]))
            records.append(
                RippleModeration(
                    assignment_id=assignment.id,
                    resource_id=resource_id,
                    user_id=user_id,
                    user_name=user_name,
                    role=role,
                    comment=comment,
                    rubric_scores=rubric_scores,
                )
            )
        db.add_all(records)
        db.commit()
        return RippleImportResult(type="moderation", imported=len(records), skipped=skipped)


@router.delete("", status_code=204)
def clear_ripple_data(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all imported resource and moderation rows for this assignment."""
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)
    db.query(RippleResource).filter(RippleResource.assignment_id == assignment.id).delete()
    db.query(RippleModeration).filter(RippleModeration.assignment_id == assignment.id).delete()
    db.commit()


@router.get("/stats", response_model=RippleStats)
def get_ripple_stats(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return counts of imported resource and moderation rows."""
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)

    resources = (
        db.query(RippleResource)
        .filter(RippleResource.assignment_id == assignment.id)
        .count()
    )
    moderations = (
        db.query(RippleModeration)
        .filter(RippleModeration.assignment_id == assignment.id)
        .count()
    )
    return RippleStats(resources=resources, moderations=moderations)
