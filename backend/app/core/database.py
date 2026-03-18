from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# SQLite requires check_same_thread=False for FastAPI's async context.
# Other databases (PostgreSQL) do not need this — it's filtered out automatically.
_connect_args = (
    {"check_same_thread": False, "timeout": 30}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
