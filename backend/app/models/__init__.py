# Import every model module here so Alembic's autogenerate can detect all tables.
from app.models.user import User  # noqa: F401
from app.models.dev_session import MockUser, DevSession  # noqa: F401
from app.models.class_ import Class  # noqa: F401
from app.models.class_member import ClassMember  # noqa: F401
from app.models.assignment import Assignment  # noqa: F401
from app.models.submission import Submission  # noqa: F401
from app.models.ripple import RippleResource, RippleModeration  # noqa: F401
from app.models.grade import GradingJob, GradeResult  # noqa: F401
from app.models.topic import TopicAttachment  # noqa: F401
