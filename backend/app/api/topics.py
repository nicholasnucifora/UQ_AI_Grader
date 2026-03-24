from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.classes import _require_class_teacher
from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.ripple import RippleModeration, RippleResource
from app.models.topic import TopicAttachment
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.document_service import document_service

router = APIRouter(
    prefix="/classes/{class_id}/assignments/{assignment_id}",
    tags=["topics"],
)


def _get_assignment_or_404(class_id: int, assignment_id: int, db: Session) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.class_id != class_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.get("/topics")
def list_topics(
    class_id: int,
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return unique topics and resource counts for this assignment."""
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    resources = (
        db.query(RippleResource)
        .filter(RippleResource.assignment_id == assignment_id)
        .all()
    )
    # Build resource_id → topic lookup and count resources per topic
    resource_topic: dict[str, str] = {}
    topic_resource_counts: dict[str, int] = {}
    for r in resources:
        topic = r.topics.strip() or "(no topic)"
        resource_topic[r.resource_id] = topic
        topic_resource_counts[topic] = topic_resource_counts.get(topic, 0) + 1

    # Count moderations per topic by resolving resource_id → topic
    moderations = (
        db.query(RippleModeration)
        .filter(RippleModeration.assignment_id == assignment_id)
        .all()
    )
    topic_moderation_counts: dict[str, int] = {}
    for m in moderations:
        topic = resource_topic.get(m.resource_id)
        if topic:
            topic_moderation_counts[topic] = topic_moderation_counts.get(topic, 0) + 1

    # Count attachments per topic
    attachment_rows = (
        db.query(TopicAttachment.topic)
        .filter(TopicAttachment.assignment_id == assignment_id)
        .all()
    )
    topic_attachment_counts: dict[str, int] = {}
    for (topic,) in attachment_rows:
        topic_attachment_counts[topic] = topic_attachment_counts.get(topic, 0) + 1

    all_topics = set(topic_resource_counts) | set(topic_moderation_counts)
    return sorted(
        [
            {
                "topic": t,
                "resource_count": topic_resource_counts.get(t, 0),
                "moderation_count": topic_moderation_counts.get(t, 0),
                "attachment_count": topic_attachment_counts.get(t, 0),
            }
            for t in all_topics
        ],
        key=lambda x: x["topic"],
    )


@router.get("/topics/{topic}/attachments")
def list_attachments(
    class_id: int,
    assignment_id: int,
    topic: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    rows = (
        db.query(TopicAttachment)
        .filter(
            TopicAttachment.assignment_id == assignment_id,
            TopicAttachment.topic == topic,
        )
        .order_by(TopicAttachment.uploaded_at)
        .all()
    )
    return [{"id": a.id, "filename": a.filename, "uploaded_at": a.uploaded_at} for a in rows]


@router.post("/topics/{topic}/attachments", status_code=201)
async def upload_attachment(
    class_id: int,
    assignment_id: int,
    topic: str,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    file_bytes = await file.read()
    filename = file.filename or "upload"

    try:
        content_text = await document_service.extract_markdown(file_bytes, filename)
    except Exception:
        content_text = ""

    attachment = TopicAttachment(
        assignment_id=assignment_id,
        topic=topic,
        filename=filename,
        content_text=content_text,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {"id": attachment.id, "filename": attachment.filename, "uploaded_at": attachment.uploaded_at}


@router.delete("/topics/{topic}/attachments/{attachment_id}")
def delete_attachment(
    class_id: int,
    assignment_id: int,
    topic: str,
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_class_teacher(class_id, current_user, db)
    _get_assignment_or_404(class_id, assignment_id, db)

    attachment = db.get(TopicAttachment, attachment_id)
    if (
        attachment is None
        or attachment.assignment_id != assignment_id
        or attachment.topic != topic
    ):
        raise HTTPException(status_code=404, detail="Attachment not found")

    db.delete(attachment)
    db.commit()
    return Response(status_code=204)
