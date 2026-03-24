import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.classes import _require_class_teacher
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.models.assignment import Assignment
from app.models.grade import GradeResult, GradingJob
from app.models.ripple import RippleModeration, RippleResource
from app.models.user import User
from app.schemas.grade import GradingJobOut, GradeResultOut, TeacherGradeIn
from app.services.auth_service import get_current_user
from app.services.grading_logic import grade_assignment, grade_preview_extension

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/classes/{class_id}/assignments/{assignment_id}/grade",
    tags=["grade"],
)


def _build_grade_result_out(r: GradeResult, db: Session) -> GradeResultOut:
    resource = db.get(RippleResource, r.ripple_resource_id)
    moderation = db.get(RippleModeration, r.ripple_moderation_id) if r.ripple_moderation_id else None
    raw_teacher = _parse_criterion_grades(r.teacher_criterion_grades) if r.teacher_criterion_grades else None
    return GradeResultOut(
        id=r.id,
        result_type=r.result_type,
        ripple_resource_id=r.ripple_resource_id,
        ripple_moderation_id=r.ripple_moderation_id,
        resource_id=resource.resource_id if resource else "",
        primary_author_name=resource.primary_author_name if resource else "",
        primary_author_id=resource.primary_author_id if resource else "",
        moderation_user_id=moderation.user_id if moderation else None,
        moderation_user_name=moderation.user_name if moderation else None,
        moderation_comment=moderation.comment if moderation else None,
        resource_topics=resource.topics if resource else "",
        resource_status=resource.resource_status if resource else "",
        status=r.status,
        criterion_grades=_parse_criterion_grades(r.criterion_grades),
        overall_feedback=r.overall_feedback,
        error_message=r.error_message,
        graded_at=r.graded_at,
        resource_sections=resource.sections if resource else [],
        teacher_criterion_grades=raw_teacher,
        teacher_overall_feedback=r.teacher_overall_feedback,
        teacher_graded_at=r.teacher_graded_at,
        teacher_graded_by=r.teacher_graded_by,
    )


def _parse_criterion_grades(val) -> list:
    """
    Normalise criterion_grades regardless of how it landed in the DB.
    Old grading runs may have double-encoded the JSON, leaving a string
    instead of a list.  Parse it if so.
    """
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, ValueError):
            return []
    return val or []


def _get_assignment_or_404(class_id: int, assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def _get_job_or_404(assignment_id: int, db: Session) -> GradingJob:
    job = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="No grading job found for this assignment")
    return job


def _run_preview_background(assignment_id: int) -> None:
    """Grade the preview sample in the API process — bypasses the worker entirely."""
    db = SessionLocal()
    try:
        grade_assignment(assignment_id, db)
    except Exception:
        logger.exception("Unhandled error in preview grading for assignment_id=%d", assignment_id)
    finally:
        db.close()


def _run_extend_preview_background(assignment_id: int) -> None:
    """Extend preview grading for spread, in the API process."""
    db = SessionLocal()
    try:
        grade_preview_extension(assignment_id, db, max_total=15)
    except Exception:
        logger.exception("Unhandled error extending preview for assignment_id=%d", assignment_id)
    finally:
        db.close()


@router.post("/preview", response_model=GradingJobOut, status_code=201)
def start_preview_grading(
    class_id: int,
    assignment_id: int,
    background_tasks: BackgroundTasks,
    type: str = Query("resource"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a preview grading job for resources or moderations (3 samples).
    Runs as a BackgroundTask in the API process so the worker is never involved.
    Only clears results of the specified type, preserving the other type's results."""
    if type not in ("resource", "moderation"):
        raise HTTPException(status_code=400, detail="type must be 'resource' or 'moderation'")

    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)

    if type == "moderation":
        if assignment.assignment_type != "resources_and_moderations":
            raise HTTPException(status_code=400, detail="Moderation preview is only available for Resources & Moderations assignments")
        moderation_count = (
            db.query(RippleModeration)
            .filter(RippleModeration.assignment_id == assignment_id)
            .count()
        )
        if moderation_count == 0:
            raise HTTPException(status_code=400, detail="No moderations imported yet")

    if not assignment.rubric_json:
        raise HTTPException(status_code=400, detail="No rubric defined for this assignment")

    if type == "resource":
        resource_count = (
            db.query(RippleResource)
            .filter(RippleResource.assignment_id == assignment_id)
            .count()
        )
        if resource_count == 0:
            raise HTTPException(status_code=400, detail="No resources imported yet")

    existing = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if existing is not None:
        if not existing.is_preview:
            raise HTTPException(status_code=400, detail="A full grading job already exists — delete it before running a preview")
        if existing.status == "running":
            raise HTTPException(status_code=400, detail="A preview is already running — cancel it first")
        # Clear only the results for the type being re-run; keep the other type's results.
        # Delete + recreate the job row so any lingering background task (cancelled mid-AI-call)
        # will get None when it next fetches by job ID and will stop cleanly.
        db.query(GradeResult).filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == type,
        ).delete()
        db.delete(existing)
        db.commit()
    else:
        # No existing preview job — clear any stale results from previous full grading runs
        db.query(GradeResult).filter(GradeResult.assignment_id == assignment_id).delete()
        db.commit()

    # Status starts as "running" — the worker only picks up "queued" jobs, so it
    # will never process this. The background task below handles it directly.
    job = GradingJob(
        assignment_id=assignment_id,
        status="running",
        is_preview=True,
        preview_type=type,
        preview_sample_size=3,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_preview_background, assignment_id)
    return job


@router.delete("/preview", status_code=204)
def clear_preview(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all preview results and the preview job, returning to a clean state."""
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    job = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if job is None:
        return Response(status_code=204)
    if not job.is_preview:
        raise HTTPException(status_code=400, detail="Cannot clear a full grading job via this endpoint")
    if job.status == "running":
        raise HTTPException(status_code=400, detail="Cancel the running preview before clearing")

    db.query(GradeResult).filter(GradeResult.assignment_id == assignment_id).delete()
    db.delete(job)
    db.commit()
    return Response(status_code=204)


@router.post("/preview/extend", response_model=GradingJobOut)
def extend_preview_for_spread(
    class_id: int,
    assignment_id: int,
    background_tasks: BackgroundTasks,
    type: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add more preview samples targeting grade spread (up to 15 total).
    Requires an existing complete preview job. Pass type=resource|moderation to
    switch which type is extended; defaults to the job's current preview_type."""
    if type is not None and type not in ("resource", "moderation"):
        raise HTTPException(status_code=400, detail="type must be 'resource' or 'moderation'")

    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    job = _get_job_or_404(assignment_id, db)
    if not job.is_preview:
        raise HTTPException(status_code=400, detail="Not a preview job")
    if job.status not in ("complete", "cancelled"):
        raise HTTPException(status_code=400, detail="Preview must be complete before extending")

    if type is not None:
        job.preview_type = type
    job.status = "running"
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_extend_preview_background, assignment_id)
    return job


@router.post("/start", response_model=GradingJobOut, status_code=201)
def start_grading(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    existing = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if existing is not None:
        if existing.status == "running" and not existing.is_preview:
            raise HTTPException(status_code=400, detail="Cancel running grading before restarting")
        # For preview jobs, complete jobs, cancelled, or error: keep GradeResults so the
        # grading logic skips already-done resources via done_resource_ids.
        db.delete(existing)
        db.commit()

    resource_count = (
        db.query(RippleResource)
        .filter(RippleResource.assignment_id == assignment_id)
        .count()
    )
    if resource_count == 0:
        raise HTTPException(status_code=400, detail="No resources imported yet")

    assignment = _get_assignment_or_404(class_id, assignment_id, db)
    if not assignment.rubric_json:
        raise HTTPException(status_code=400, detail="No rubric defined for this assignment")

    job = GradingJob(assignment_id=assignment_id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.post("/cancel", response_model=GradingJobOut)
def cancel_grading(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    job = _get_job_or_404(assignment_id, db)
    job.status = "cancelled"
    db.commit()
    db.refresh(job)
    return job


@router.delete("/ai-grades")
def clear_ai_grades(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear AI-generated grades while preserving teacher marks.
    Rows with teacher grades have their AI fields nulled out;
    rows without teacher grades are deleted entirely.
    The grading job is also deleted so AI grading can be restarted."""
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    results = (
        db.query(GradeResult)
        .filter(GradeResult.assignment_id == assignment_id)
        .all()
    )
    for r in results:
        if r.teacher_criterion_grades:
            r.criterion_grades = []
            r.overall_feedback = None
            r.error_message = None
            r.status = "pending"
        else:
            db.delete(r)

    job = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if job is not None:
        db.delete(job)

    db.commit()
    return Response(status_code=204)


@router.delete("/")
def delete_grading(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    job = _get_job_or_404(assignment_id, db)
    if job.status == "running" and not job.is_preview:
        raise HTTPException(status_code=400, detail="Cancel grading before deleting")

    db.query(GradeResult).filter(GradeResult.assignment_id == assignment_id).delete()
    db.delete(job)
    db.commit()
    return Response(status_code=204)


@router.get("/status", response_model=GradingJobOut | None)
def get_grade_status(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)
    return db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()


@router.get("/report")
def get_grade_report(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns three analytics views over the completed grade results:
      - criterion_difficulty: criteria sorted hardest→easiest by avg % score
      - topic_breakdown: per-topic average score
      - peer_ai_agreement: AI score vs peer moderation scores per resource
    """
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    results = (
        db.query(GradeResult)
        .filter(GradeResult.assignment_id == assignment_id, GradeResult.status == "complete")
        .all()
    )

    if not results:
        return {"criterion_difficulty": [], "topic_breakdown": [], "peer_ai_agreement": []}

    # Max points per criterion from the rubric
    assignment = db.get(Assignment, assignment_id)
    envelope = json.loads(assignment.rubric_json) if assignment and assignment.rubric_json else {}
    resource_rubric = envelope.get("resource", envelope)
    moderation_rubric = envelope.get("moderation") or resource_rubric

    def _build_max_by_cid(rubric):
        result = {}
        for c in rubric.get("criteria", []):
            levels = c.get("levels", [])
            result[c["id"]] = max((l["points"] for l in levels), default=0) if levels else 0
        return result

    max_by_cid = _build_max_by_cid(resource_rubric)
    mod_max_by_cid = _build_max_by_cid(moderation_rubric)

    def _compute_criterion_difficulty(result_type, max_map):
        crit_data = {}
        for r in results:
            if r.result_type != result_type:
                continue
            for cg in _parse_criterion_grades(r.criterion_grades):
                cid = cg.get("criterion_id", "")
                if not cid:
                    continue
                if cid not in crit_data:
                    crit_data[cid] = {
                        "criterion_id": cid,
                        "criterion_name": cg.get("criterion_name", cid),
                        "points": [],
                        "level_counts": {},
                    }
                crit_data[cid]["points"].append(cg.get("points_awarded", 0))
                lvl = cg.get("level_title", "Unknown")
                crit_data[cid]["level_counts"][lvl] = crit_data[cid]["level_counts"].get(lvl, 0) + 1
        out = []
        for cid, data in crit_data.items():
            pts = data["points"]
            avg = sum(pts) / len(pts) if pts else 0
            max_pts = max_map.get(cid, 0)
            pct = (avg / max_pts * 100) if max_pts > 0 else 0
            out.append({
                "criterion_id": cid,
                "criterion_name": data["criterion_name"],
                "avg_points": round(avg, 2),
                "max_points": max_pts,
                "avg_pct": round(pct, 1),
                "level_distribution": data["level_counts"],
            })
        out.sort(key=lambda x: x["avg_pct"])
        return out

    criterion_difficulty = _compute_criterion_difficulty("resource", max_by_cid)
    moderation_criterion_difficulty = _compute_criterion_difficulty("moderation", mod_max_by_cid)

    # --- Topic breakdown (resource grades only) ---
    topic_data = {}
    for r in results:
        if r.result_type != "resource":
            continue
        resource = db.get(RippleResource, r.ripple_resource_id)
        if not resource:
            continue
        topics_str = resource.topics or ""
        topics = [t.strip() for t in topics_str.split(",") if t.strip()] or ["(no topic)"]
        ai_total = sum(cg.get("points_awarded", 0) for cg in (_parse_criterion_grades(r.criterion_grades)))
        max_total = sum(max_by_cid.get(cg.get("criterion_id", ""), 0) for cg in (_parse_criterion_grades(r.criterion_grades)))
        for topic in topics:
            if topic not in topic_data:
                topic_data[topic] = {"scores": [], "max_scores": []}
            topic_data[topic]["scores"].append(ai_total)
            topic_data[topic]["max_scores"].append(max_total)

    topic_breakdown = []
    for topic, data in topic_data.items():
        scores = data["scores"]
        max_scores = data["max_scores"]
        avg_score = sum(scores) / len(scores) if scores else 0
        avg_max = sum(max_scores) / len(max_scores) if max_scores else 0
        avg_pct = (avg_score / avg_max * 100) if avg_max > 0 else 0
        topic_breakdown.append({
            "topic": topic,
            "count": len(scores),
            "avg_score": round(avg_score, 2),
            "avg_pct": round(avg_pct, 1),
        })
    topic_breakdown.sort(key=lambda x: x["avg_pct"])

    return {
        "criterion_difficulty": criterion_difficulty,
        "moderation_criterion_difficulty": moderation_criterion_difficulty,
        "topic_breakdown": topic_breakdown,
    }


@router.get("/results", response_model=list[GradeResultOut])
def get_grade_results(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    rows = (
        db.query(GradeResult)
        .filter(GradeResult.assignment_id == assignment_id)
        .order_by(GradeResult.graded_at)
        .all()
    )
    return [_build_grade_result_out(r, db) for r in rows]


@router.put("/results/{result_id}/teacher", response_model=GradeResultOut)
def save_teacher_grade(
    class_id: int,
    assignment_id: int,
    result_id: int,
    body: TeacherGradeIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    result = db.get(GradeResult, result_id)
    if result is None or result.assignment_id != assignment_id:
        raise HTTPException(status_code=404, detail="Grade result not found")

    result.teacher_criterion_grades = [g.model_dump() for g in body.criterion_grades]
    result.teacher_graded_at = datetime.now(timezone.utc)
    result.teacher_graded_by = current_user.user_id
    db.commit()
    db.refresh(result)
    return _build_grade_result_out(result, db)


# ---------------------------------------------------------------------------
# Email endpoint — returns mailto fields for the frontend to open
# ---------------------------------------------------------------------------

def _resolve_email_address(result: GradeResult, db: Session, override: str | None) -> str:
    """Return the email address to use, or raise HTTPException if it can't be determined."""
    if override:
        return override

    if not settings.student_email_domain:
        raise HTTPException(
            status_code=400,
            detail="STUDENT_EMAIL_DOMAIN is not configured — set it in .env or type the address manually",
        )

    if result.result_type == "moderation" and result.ripple_moderation_id:
        moderation = db.get(RippleModeration, result.ripple_moderation_id)
        student_id = moderation.user_id if moderation else ""
    else:
        resource = db.get(RippleResource, result.ripple_resource_id)
        student_id = resource.primary_author_id if resource else ""

    if not student_id:
        raise HTTPException(status_code=400, detail="No student ID found for this result")

    return f"{student_id}@{settings.student_email_domain}"


@router.get("/results/email-student/{student_id}")
def get_student_grade_email(
    class_id: int,
    assignment_id: int,
    student_id: str,
    topic: str | None = Query(default=None),
    to_email: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a single mailto email body covering all of a student's grade results.
    Pass ?topic=... to filter to a specific topic."""
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)

    rubric_envelope = json.loads(assignment.rubric_json) if assignment.rubric_json else {}
    resource_rubric = rubric_envelope.get("resource", rubric_envelope)
    moderation_rubric = rubric_envelope.get("moderation") or resource_rubric

    all_results = (
        db.query(GradeResult)
        .filter(GradeResult.assignment_id == assignment_id, GradeResult.status == "complete")
        .all()
    )

    student_items: list[tuple] = []  # (GradeResult, RippleResource, RippleModeration|None)
    for r in all_results:
        res = db.get(RippleResource, r.ripple_resource_id)
        if not res:
            continue
        if r.result_type == "resource" and res.primary_author_id == student_id:
            student_items.append((r, res, None))
        elif r.result_type == "moderation" and r.ripple_moderation_id:
            mod = db.get(RippleModeration, r.ripple_moderation_id)
            if mod and mod.user_id == student_id:
                student_items.append((r, res, mod))

    if topic:
        student_items = [(r, res, mod) for r, res, mod in student_items if (res.topics or "").strip() == topic]

    if not student_items:
        raise HTTPException(status_code=404, detail="No completed results found for this student")

    # Resolve email address
    resolved_to = to_email
    if not resolved_to:
        if not settings.student_email_domain:
            raise HTTPException(
                status_code=400,
                detail="STUDENT_EMAIL_DOMAIN is not configured — set it in .env or type the address manually",
            )
        resolved_to = f"{student_id}@{settings.student_email_domain}"

    # Get student name from first resource result, falling back to moderation
    student_name = ""
    for r, res, mod in student_items:
        if r.result_type == "resource" and res.primary_author_name:
            student_name = res.primary_author_name
            break
        if r.result_type == "moderation" and mod and mod.user_name:
            student_name = mod.user_name

    # Precompute grade scale dicts once
    resource_grade_scale = {
        "enabled": assignment.grade_scale_enabled,
        "max": assignment.grade_scale_max,
        "rounding": assignment.grade_rounding or "none",
        "decimal_places": assignment.grade_decimal_places or 2,
    }
    if assignment.separate_moderation_grade_scale and assignment.moderation_grade_scale_max:
        moderation_grade_scale = {
            "enabled": assignment.grade_scale_enabled,
            "max": assignment.moderation_grade_scale_max,
            "rounding": assignment.moderation_grade_rounding or "none",
            "decimal_places": assignment.moderation_grade_decimal_places or 2,
        }
    else:
        moderation_grade_scale = resource_grade_scale

    # Group by topic
    topic_map: dict = {}
    for r, res, mod in student_items:
        t = (res.topics or "").strip() or "No Topic"
        if t not in topic_map:
            topic_map[t] = {"resources": [], "moderations": []}
        rubric = moderation_rubric if r.result_type == "moderation" else resource_rubric
        grade_scale = moderation_grade_scale if r.result_type == "moderation" else resource_grade_scale
        item = {
            "result_type": r.result_type,
            "resource_id": res.resource_id,
            "criterion_grades": _parse_criterion_grades(r.criterion_grades),
            "overall_feedback": r.overall_feedback,
            "teacher_criterion_grades": _parse_criterion_grades(r.teacher_criterion_grades) if r.teacher_criterion_grades else None,
            "teacher_overall_feedback": r.teacher_overall_feedback,
            "rubric": rubric,
            "grade_scale": grade_scale,
        }
        if r.result_type == "moderation" and mod:
            item["moderation_id"] = mod.resource_id
        if r.result_type == "resource":
            topic_map[t]["resources"].append(item)
        else:
            topic_map[t]["moderations"].append(item)

    results_by_topic = [
        {"topic": t, "resources": v["resources"], "moderations": v["moderations"]}
        for t, v in sorted(topic_map.items())
    ]

    from app.services.email_service import build_student_summary_text
    body = build_student_summary_text(
        assignment_name=assignment.title,
        student_name=student_name,
        student_id=student_id,
        results_by_topic=results_by_topic,
        assignment_type=assignment.assignment_type,
        combine_resource_grades=bool(assignment.combine_resource_grades),
        combine_resource_max_n=assignment.combine_resource_max_n,
        combine_moderation_grades=bool(assignment.combine_moderation_grades),
        combine_moderation_max_n=assignment.combine_moderation_max_n,
    )

    subject = f"AI Grade Summary: {assignment.title}"
    if topic:
        subject = f"AI Grade Summary ({topic}): {assignment.title}"

    return {"to": resolved_to, "subject": subject, "body": body}


@router.get("/results/{result_id}/email")
def get_grade_email(
    class_id: int,
    assignment_id: int,
    result_id: int,
    to_email: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return mailto fields (to, subject, body) for this grade result.
    The frontend constructs the mailto: URI and opens the default mail client."""
    _require_class_teacher(class_id, current_user, db)
    assignment = _get_assignment_or_404(class_id, assignment_id, db)

    result = db.get(GradeResult, result_id)
    if result is None or result.assignment_id != assignment_id:
        raise HTTPException(status_code=404, detail="Grade result not found")
    if result.status != "complete":
        raise HTTPException(status_code=400, detail="Grade result is not complete")

    resolved_to = _resolve_email_address(result, db, to_email)

    resource = db.get(RippleResource, result.ripple_resource_id)
    moderation = db.get(RippleModeration, result.ripple_moderation_id) if result.ripple_moderation_id else None

    if result.result_type == "moderation" and moderation:
        student_id = moderation.user_id
        student_name = moderation.user_name or moderation.user_id
    else:
        student_id = resource.primary_author_id if resource else ""
        student_name = resource.primary_author_name if resource else ""

    rubric_envelope = json.loads(assignment.rubric_json) if assignment.rubric_json else {}
    if result.result_type == "moderation":
        rubric = rubric_envelope.get("moderation") or rubric_envelope.get("resource", rubric_envelope)
    else:
        rubric = rubric_envelope.get("resource", rubric_envelope)

    # Build grade scale dict for the correct result type
    if (
        result.result_type == "moderation"
        and assignment.separate_moderation_grade_scale
        and assignment.moderation_grade_scale_max
    ):
        grade_scale = {
            "enabled": assignment.grade_scale_enabled,
            "max": assignment.moderation_grade_scale_max,
            "rounding": assignment.moderation_grade_rounding or "none",
            "decimal_places": assignment.moderation_grade_decimal_places or 2,
        }
    else:
        grade_scale = {
            "enabled": assignment.grade_scale_enabled,
            "max": assignment.grade_scale_max,
            "rounding": assignment.grade_rounding or "none",
            "decimal_places": assignment.grade_decimal_places or 2,
        }

    from app.services.email_service import build_grade_text
    body = build_grade_text(
        assignment_name=assignment.title,
        student_name=student_name,
        student_id=student_id,
        result_type=result.result_type,
        criterion_grades=_parse_criterion_grades(result.criterion_grades),
        overall_feedback=result.overall_feedback,
        rubric=rubric,
        teacher_criterion_grades=_parse_criterion_grades(result.teacher_criterion_grades) if result.teacher_criterion_grades else None,
        teacher_overall_feedback=result.teacher_overall_feedback,
        grade_scale=grade_scale,
    )

    return {
        "to": resolved_to,
        "subject": f"AI Grade: {assignment.title}",
        "body": body,
    }


