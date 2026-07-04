"""Database engine, session dependency, and initialization."""

from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

from config import DB_URL

# check_same_thread=False is required for SQLite + FastAPI's threaded request handling.
engine = create_engine(DB_URL, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create all tables. Idempotent."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLModel session and closes it after use."""
    with Session(engine) as session:
        yield session