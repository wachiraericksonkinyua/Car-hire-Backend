"""Database setup: the declarative base, engine, and session helpers."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


# Every ORM model inherits from `Base`. This gives Python a single registry
# of all tables, which Alembic and `Base.metadata.create_all()` rely on.
class Base(DeclarativeBase):
    pass


# The engine owns the connection pool to PostgreSQL. It is created once,
# when this module is imported, using the URL from our validated settings.
engine = create_async_engine(get_settings().DATABASE_URL)


# A session factory. Each call to `SessionLocal()` creates a new short-lived
# AsyncSession. `expire_on_commit=False` keeps object attributes readable
# after a commit without triggering extra lazy database queries.
SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# FastAPI dependency: open a session for one request, then always close it.
# Routes declare `db: AsyncSession = Depends(get_db)` to receive a session.
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
