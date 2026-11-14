"""Shared PostgreSQL test fixtures.

Tests run against a real PostgreSQL database — never SQLite. The database name
must end in ``_test`` as a safety guard so a misconfigured URL cannot wipe a
development or production database.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (register every model on Base.metadata)
from app.core.database import Base, get_db
from app.core.rate_limit import reset_login_rate_limits
from app.main import app

API_DIR = Path(__file__).resolve().parents[1]

# Matches docker-compose.yml (host port 5433, test database).
DEFAULT_TEST_DATABASE_URL = (
    "postgresql+asyncpg://autohire:autohire@localhost:5433/autohire_test"
)


def _test_database_url() -> str:
    """Read TEST_DATABASE_URL at runtime, not at import time."""
    return os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)


def _database_name(url: str) -> str:
    return url.rsplit("/", 1)[-1].split("?")[0]


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    """Reset the test database and apply the real Alembic migrations."""
    url = _test_database_url()
    if not _database_name(url).endswith("_test"):
        raise RuntimeError(
            "Refusing to run tests against a database whose name does not "
            f"end in '_test' (got {url!r})."
        )

    reset_engine = create_async_engine(url)
    async with reset_engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await reset_engine.dispose()

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(API_DIR),
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "alembic upgrade head failed for the test database:\n"
            f"{result.stdout}\n{result.stderr}"
        )

    engine = create_async_engine(url, pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
def session_factory(db_engine):
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(db_engine):
    """Start every test from empty tables."""
    reset_login_rate_limits()
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)

    async with db_engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")
        )

    yield


@pytest_asyncio.fixture
async def db_session(session_factory):
    """A session for seeding data and model-level tests."""
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def api_client(session_factory):
    """HTTP client running the real FastAPI app in the same event loop.

    Each request gets its own database session, mirroring production's
    ``get_db`` dependency.
    """

    async def override_get_db():
        async with session_factory() as session:
            async with session.begin():
                yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    try:
        async with AsyncClient(
            transport=transport,
            base_url="https://testserver",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
