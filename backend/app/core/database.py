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
engine = create_async_engine(
    get_settings().DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
)


# A session factory. Each call to `SessionLocal()` creates a new short-lived
# AsyncSession. `expire_on_commit=False` keeps object attributes readable
# after a commit without triggering extra lazy database queries.
SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# FastAPI dependency: one transaction per request.
# The transaction commits when the request succeeds and rolls back when it
# raises. Services therefore flush instead of committing.
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        async with session.begin():
            yield session
