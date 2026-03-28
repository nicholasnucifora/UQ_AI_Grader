"""
Pure grading logic — no HTTP, no worker mechanics, no asyncio.
Called by the worker process.
"""
import json
import logging
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.class_ import Class
from app.models.grade import GradeResult, GradingJob
from app.models.ripple import RippleModeration, RippleResource
from app.models.topic import TopicAttachment
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)


def _find_grade_result(
    db: Session,
    assignment_id: int,
    ripple_resource_id: int,
    result_type: str,
    ripple_moderation_id: int | None = None,
) -> "GradeResult | None":
    """Return an existing GradeResult for this resource/moderation, or None."""
    q = db.query(GradeResult).filter(
        GradeResult.assignment_id == assignment_id,
        GradeResult.ripple_resource_id == ripple_resource_id,
        GradeResult.result_type == result_type,
    )
    if ripple_moderation_id is not None:
        q = q.filter(GradeResult.ripple_moderation_id == ripple_moderation_id)
    return q.first()


def _upsert_grade_result(db: Session, existing: "GradeResult | None", **kwargs) -> "GradeResult":
    """Update AI fields on an existing row, or add a new GradeResult."""
    if existing is not None:
        for key, val in kwargs.items():
            setattr(existing, key, val)
        return existing
    row = GradeResult(**kwargs)
    db.add(row)
    return row


def grade_assignment(assignment_id: int, db: Session) -> None:
    job = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if job is None or job.status == "cancelled":
        return
    # Pin the job ID so the loop re-fetches by ID, not assignment_id.
    # If the job is deleted and recreated (new run started), the old task
    # will get None and stop instead of racing with the new task.
    job_id = job.id

    assignment = db.get(Assignment, assignment_id)
    if assignment is None or not assignment.rubric_json:
        job.status = "error"
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.error("No rubric for assignment_id=%d", assignment_id)
        return

    envelope = json.loads(assignment.rubric_json)
    resource_rubric_dict = envelope.get("resource", envelope)
    moderation_rubric_dict = envelope.get("moderation") or resource_rubric_dict
    ai_model = assignment.ai_model or None
    feedback_format = assignment.feedback_format or ""
    use_topic_attachments = bool(assignment.use_topic_attachments)
    topic_attachment_instructions = assignment.topic_attachment_instructions or ""

    cls = db.get(Class, assignment.class_id)
    context = {
        "class_description": cls.description if cls else "",
        "assignment_description": assignment.description,
        "marking_criteria": assignment.marking_criteria,
        "additional_notes": assignment.additional_notes,
    }

    # Load only IDs — plain ints are never "expired" by SQLAlchemy
    resource_ids = [
        row[0]
        for row in db.query(RippleResource.id)
        .filter(RippleResource.assignment_id == assignment_id)
        .all()
    ]
    moderation_ids = [
        row[0]
        for row in db.query(RippleModeration.id)
        .filter(RippleModeration.assignment_id == assignment_id)
        .all()
    ]

    done_resource_ids = {
        row[0]
        for row in db.query(GradeResult.ripple_resource_id)
        .filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == "resource",
            GradeResult.status == "complete",
        )
        .all()
    }
    done_moderation_ids = {
        row[0]
        for row in db.query(GradeResult.ripple_moderation_id)
        .filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == "moderation",
            GradeResult.status == "complete",
            GradeResult.ripple_moderation_id.isnot(None),
        )
        .all()
    }

    # Preview mode: limit to a small sample of one type only, drawn from ungraded items
    # so that adding new data after a full run gives a valid preview of those new items.
    # Explicitly cast is_preview to bool — SQLite returns it as int (0/1)
    if bool(job.is_preview):
        sample = max(1, int(job.preview_sample_size or 3))
        ptype = job.preview_type or "resource"
        if ptype == "moderation":
            resource_ids = []
            ungraded_mod_ids = [mid for mid in moderation_ids if mid not in done_moderation_ids]
            moderation_ids = ungraded_mod_ids[:sample]
        else:
            ungraded_resource_ids = [rid for rid in resource_ids if rid not in done_resource_ids]
            resource_ids = ungraded_resource_ids[:sample]
            moderation_ids = []

    # Filter to only items that still need grading
    pending_resource_ids = [rid for rid in resource_ids if rid not in done_resource_ids]
    pending_moderation_ids = [mid for mid in moderation_ids if mid not in done_moderation_ids]

    job.status = "running"
    job.total = len(pending_resource_ids) + len(pending_moderation_ids)
    job.graded = 0
    job.updated_at = datetime.now(timezone.utc)
    db.commit()

    # ------------------------------------------------------------------ #
    # Phase 1: grade resources                                             #
    # ------------------------------------------------------------------ #
    for resource_id in pending_resource_ids:

        job = db.get(GradingJob, job_id)
        if job is None or job.status == "cancelled":
            logger.info("Job superseded or cancelled (assignment_id=%d)", assignment_id)
            return

        resource = db.get(RippleResource, resource_id)
        if resource is None:
            continue

        sections = list(resource.sections or [])
        resource_id_str = resource.resource_id

        # Load topic attachments if enabled
        topic_attachments = None
        if use_topic_attachments:
            resource_topic = (resource.topics or "").strip()
            if resource_topic:
                rows = (
                    db.query(TopicAttachment)
                    .filter(
                        TopicAttachment.assignment_id == assignment_id,
                        TopicAttachment.topic == resource_topic,
                    )
                    .all()
                )
                topic_attachments = [
                    {"filename": a.filename, "content_text": a.content_text}
                    for a in rows
                    if a.content_text.strip()
                ]

        db.commit()

        try:
            result = ai_service.grade_submission(
                sections=sections,
                rubric=resource_rubric_dict,
                context=context,
                model=ai_model,
                feedback_format=feedback_format,
                topic_attachments=topic_attachments,
                topic_attachment_instructions=topic_attachment_instructions,
            )
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, resource_id, "resource"),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=resource_id,
                result_type="resource",
                status="complete",
                criterion_grades=result["criterion_grades"],
                overall_feedback=result.get("overall_feedback", ""),
                error_message=None,
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "graded": GradingJob.graded + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()
            logger.info("Graded resource_id=%s", resource_id_str)
        except Exception as exc:
            logger.exception("Error grading resource_id=%s: %s", resource_id_str, exc)
            db.rollback()
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, resource_id, "resource"),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=resource_id,
                result_type="resource",
                status="error",
                criterion_grades=[],
                overall_feedback="",
                error_message=str(exc),
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "errors": GradingJob.errors + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()

    # ------------------------------------------------------------------ #
    # Phase 2: grade moderations                                           #
    # ------------------------------------------------------------------ #
    logger.info(
        "Phase 2: grading %d moderation(s) for assignment_id=%d",
        len(moderation_ids), assignment_id,
    )
    for moderation_id in pending_moderation_ids:

        job = db.get(GradingJob, job_id)
        if job is None or job.status == "cancelled":
            logger.info("Job superseded or cancelled (assignment_id=%d)", assignment_id)
            return

        moderation = db.get(RippleModeration, moderation_id)
        if moderation is None:
            continue

        # Look up the original resource for context.
        # If the resource was filtered out at import we proceed without it
        # (original_sections will be empty) so the moderation is still graded.
        original_resource = (
            db.query(RippleResource)
            .filter(
                RippleResource.assignment_id == assignment_id,
                RippleResource.resource_id == moderation.resource_id,
            )
            .first()
        )
        if original_resource is None:
            logger.warning(
                "moderation_id=%d references resource_id=%s which was not imported "
                "(filtered at import or missing) — grading without original context",
                moderation_id, moderation.resource_id,
            )

        comment = moderation.comment
        original_sections = list(original_resource.sections or []) if original_resource else []
        # Use the original resource PK if available; fall back to the first
        # resource for this assignment as a placeholder FK (never null in schema).
        if original_resource is not None:
            original_resource_pk = original_resource.id
        else:
            fallback = (
                db.query(RippleResource.id)
                .filter(RippleResource.assignment_id == assignment_id)
                .first()
            )
            if fallback is None:
                logger.error(
                    "No resources at all for assignment_id=%d — cannot store moderation grade, skipping",
                    assignment_id,
                )
                continue
            original_resource_pk = fallback[0]

        mod_id_val = moderation.id
        mod_user_id = moderation.user_id

        db.commit()

        try:
            result = ai_service.grade_moderation(
                moderation_comment=comment,
                original_sections=original_sections,
                rubric=moderation_rubric_dict,
                context={
                    **context,
                    "additional_notes": assignment.moderation_additional_notes or context["additional_notes"],
                },
                model=ai_model,
                feedback_format=feedback_format,
            )
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, original_resource_pk, "moderation", mod_id_val),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=original_resource_pk,
                ripple_moderation_id=mod_id_val,
                result_type="moderation",
                status="complete",
                criterion_grades=result["criterion_grades"],
                overall_feedback=result.get("overall_feedback", ""),
                error_message=None,
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "graded": GradingJob.graded + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()
            logger.info("Graded moderation_id=%d by user=%s", mod_id_val, mod_user_id)
        except Exception as exc:
            logger.exception("Error grading moderation_id=%d: %s", mod_id_val, exc)
            db.rollback()
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, original_resource_pk, "moderation", mod_id_val),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=original_resource_pk,
                ripple_moderation_id=mod_id_val,
                result_type="moderation",
                status="error",
                criterion_grades=[],
                overall_feedback="",
                error_message=str(exc),
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "errors": GradingJob.errors + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()

    job = db.get(GradingJob, job_id)
    if job and job.status != "cancelled":
        job.status = "complete"
        job.completed_at = datetime.now(timezone.utc)
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "Grading complete for assignment_id=%d: %d graded, %d errors",
            assignment_id,
            job.graded,
            job.errors,
        )


def _has_good_spread(assignment_id: int, max_possible: float, db: Session, result_type: str = "resource") -> bool:
    """True if results include at least one high-scoring AND one low-scoring submission.
    Requires a result in the top 40% AND a result in the bottom 40% of max score."""
    results = (
        db.query(GradeResult)
        .filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == result_type,
            GradeResult.status == "complete",
        )
        .all()
    )
    if len(results) < 2:
        return False
    scores = [
        sum(g.get("points_awarded", 0) for g in (r.criterion_grades or []))
        for r in results
    ]
    has_high = max(scores) >= max_possible * 0.60
    has_low = min(scores) <= max_possible * 0.40
    return has_high and has_low


def grade_preview_extension(assignment_id: int, db: Session, max_total: int = 15) -> None:
    """Grade more samples targeting grade spread. Appends to existing preview results.
    Reads job.preview_type to determine whether to extend resources or moderations.
    Stops when there is both a high-scoring and low-scoring result, or max_total is reached.
    """
    job = db.query(GradingJob).filter(GradingJob.assignment_id == assignment_id).first()
    if job is None or not job.is_preview:
        return
    job_id = job.id

    ptype = job.preview_type or "resource"

    assignment = db.get(Assignment, assignment_id)
    if assignment is None or not assignment.rubric_json:
        if job:
            job.status = "error"
            db.commit()
        return

    envelope = json.loads(assignment.rubric_json)
    resource_rubric_dict = envelope.get("resource", envelope)
    moderation_rubric_dict = envelope.get("moderation") or resource_rubric_dict
    ai_model = assignment.ai_model or None
    feedback_format = assignment.feedback_format or ""
    use_topic_attachments = bool(assignment.use_topic_attachments)
    topic_attachment_instructions = assignment.topic_attachment_instructions or ""

    cls = db.get(Class, assignment.class_id)
    context = {
        "class_description": cls.description if cls else "",
        "assignment_description": assignment.description,
        "marking_criteria": assignment.marking_criteria,
        "additional_notes": assignment.additional_notes,
    }

    if ptype == "moderation":
        _extend_moderation_preview(
            assignment_id=assignment_id,
            db=db,
            job=job,
            assignment=assignment,
            moderation_rubric_dict=moderation_rubric_dict,
            context=context,
            ai_model=ai_model,
            feedback_format=feedback_format,
            max_total=max_total,
        )
        return

    # Resource extension (original behaviour)
    rubric_for_spread = resource_rubric_dict
    max_possible = sum(
        max((l["points"] for l in c.get("levels", [])), default=0)
        for c in rubric_for_spread.get("criteria", [])
    )

    all_resource_ids = [
        row[0]
        for row in db.query(RippleResource.id)
        .filter(RippleResource.assignment_id == assignment_id)
        .all()
    ]

    done_resource_ids = {
        row[0]
        for row in db.query(GradeResult.ripple_resource_id)
        .filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == "resource",
            GradeResult.status == "complete",
        )
        .all()
    }

    remaining_ids = [rid for rid in all_resource_ids if rid not in done_resource_ids]
    random.shuffle(remaining_ids)
    current_total = len(done_resource_ids)

    if not remaining_ids or current_total >= max_total:
        job.status = "complete"
        db.commit()
        return

    expected_new = min(len(remaining_ids), max_total - current_total)
    job.total = current_total + expected_new
    job.graded = current_total
    job.updated_at = datetime.now(timezone.utc)
    db.commit()

    for resource_id in remaining_ids:
        if current_total >= max_total:
            break

        job = db.get(GradingJob, job_id)
        if job is None or job.status == "cancelled":
            return

        resource = db.get(RippleResource, resource_id)
        if resource is None:
            continue

        sections = list(resource.sections or [])

        topic_attachments = None
        if use_topic_attachments:
            resource_topic = (resource.topics or "").strip()
            if resource_topic:
                rows = (
                    db.query(TopicAttachment)
                    .filter(
                        TopicAttachment.assignment_id == assignment_id,
                        TopicAttachment.topic == resource_topic,
                    )
                    .all()
                )
                topic_attachments = [
                    {"filename": a.filename, "content_text": a.content_text}
                    for a in rows
                    if a.content_text.strip()
                ]

        db.commit()

        try:
            result = ai_service.grade_submission(
                sections=sections,
                rubric=resource_rubric_dict,
                context=context,
                model=ai_model,
                feedback_format=feedback_format,
                topic_attachments=topic_attachments,
                topic_attachment_instructions=topic_attachment_instructions,
            )
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, resource_id, "resource"),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=resource_id,
                result_type="resource",
                status="complete",
                criterion_grades=result["criterion_grades"],
                overall_feedback=result.get("overall_feedback", ""),
                error_message=None,
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "graded": GradingJob.graded + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()
            current_total += 1
            logger.info("Extend preview: graded %s (%d total)", resource.resource_id, current_total)
        except Exception as exc:
            logger.exception("Extend preview error for %s: %s", resource.resource_id, exc)
            db.rollback()
            current_total += 1
            continue

        if max_possible > 0 and _has_good_spread(assignment_id, max_possible, db, "resource"):
            logger.info("Extend preview: good spread achieved at %d samples", current_total)
            break

    job = db.get(GradingJob, job_id)
    if job and job.status != "cancelled":
        job.status = "complete"
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("Extend preview complete for assignment_id=%d: %d total samples", assignment_id, current_total)


def _extend_moderation_preview(
    assignment_id: int,
    db: Session,
    job: "GradingJob",
    assignment: "Assignment",
    moderation_rubric_dict: dict,
    context: dict,
    ai_model: str | None,
    feedback_format: str,
    max_total: int = 15,
) -> None:
    """Internal helper: extend a moderation preview, seeking grade spread."""
    job_id = job.id
    max_possible = sum(
        max((l["points"] for l in c.get("levels", [])), default=0)
        for c in moderation_rubric_dict.get("criteria", [])
    )

    all_moderation_ids = [
        row[0]
        for row in db.query(RippleModeration.id)
        .filter(RippleModeration.assignment_id == assignment_id)
        .all()
    ]

    done_moderation_ids = {
        row[0]
        for row in db.query(GradeResult.ripple_moderation_id)
        .filter(
            GradeResult.assignment_id == assignment_id,
            GradeResult.result_type == "moderation",
            GradeResult.status == "complete",
            GradeResult.ripple_moderation_id.isnot(None),
        )
        .all()
    }

    remaining_ids = [mid for mid in all_moderation_ids if mid not in done_moderation_ids]
    random.shuffle(remaining_ids)
    current_total = len(done_moderation_ids)

    if not remaining_ids or current_total >= max_total:
        job.status = "complete"
        db.commit()
        return

    expected_new = min(len(remaining_ids), max_total - current_total)
    job.total = current_total + expected_new
    job.graded = current_total
    job.updated_at = datetime.now(timezone.utc)
    db.commit()

    for moderation_id in remaining_ids:
        if current_total >= max_total:
            break

        job = db.get(GradingJob, job_id)
        if job is None or job.status == "cancelled":
            return

        moderation = db.get(RippleModeration, moderation_id)
        if moderation is None:
            continue

        original_resource = (
            db.query(RippleResource)
            .filter(
                RippleResource.assignment_id == assignment_id,
                RippleResource.resource_id == moderation.resource_id,
            )
            .first()
        )
        if original_resource is not None:
            original_resource_pk = original_resource.id
        else:
            fallback = (
                db.query(RippleResource.id)
                .filter(RippleResource.assignment_id == assignment_id)
                .first()
            )
            if fallback is None:
                continue
            original_resource_pk = fallback[0]

        original_sections = list(original_resource.sections or []) if original_resource else []
        mod_context = {
            **context,
            "additional_notes": assignment.moderation_additional_notes or context["additional_notes"],
        }

        db.commit()

        try:
            result = ai_service.grade_moderation(
                moderation_comment=moderation.comment,
                original_sections=original_sections,
                rubric=moderation_rubric_dict,
                context=mod_context,
                model=ai_model,
                feedback_format=feedback_format,
            )
            _upsert_grade_result(
                db,
                _find_grade_result(db, assignment_id, original_resource_pk, "moderation", moderation_id),
                assignment_id=assignment_id,
                job_id=job_id,
                ripple_resource_id=original_resource_pk,
                ripple_moderation_id=moderation_id,
                result_type="moderation",
                status="complete",
                criterion_grades=result["criterion_grades"],
                overall_feedback=result.get("overall_feedback", ""),
                error_message=None,
                graded_at=datetime.now(timezone.utc),
            )
            db.query(GradingJob).filter(GradingJob.id == job_id).update({
                "graded": GradingJob.graded + 1,
                "updated_at": datetime.now(timezone.utc),
            })
            db.commit()
            current_total += 1
            logger.info("Extend moderation preview: graded moderation_id=%d (%d total)", moderation_id, current_total)
        except Exception as exc:
            logger.exception("Extend moderation preview error for moderation_id=%d: %s", moderation_id, exc)
            db.rollback()
            current_total += 1
            continue

        if max_possible > 0 and _has_good_spread(assignment_id, max_possible, db, "moderation"):
            logger.info("Extend moderation preview: good spread achieved at %d samples", current_total)
            break

    job = db.get(GradingJob, job_id)
    if job and job.status != "cancelled":
        job.status = "complete"
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("Extend moderation preview complete for assignment_id=%d: %d total samples", assignment_id, current_total)
