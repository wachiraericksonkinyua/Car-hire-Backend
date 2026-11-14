import pytest
import pytest_asyncio
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models import User, UserRole


@pytest_asyncio.fixture
async def session():
    # StaticPool keeps a single in-memory connection alive, so the tables
    # created here are visible to the session that follows.
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db_session:
        yield db_session

    await engine.dispose()


@pytest.mark.asyncio
async def test_create_and_read_user(session):
    user = User(
        email="admin@autohire.co.ke",
        full_name="Admin User",
        password_hash="hashed-secret",
        role=UserRole.ADMIN,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)  # load the server-generated created_at

    stored = await session.get(User, user.id)

    assert stored is not None
    assert stored.email == "admin@autohire.co.ke"
    assert stored.role == UserRole.ADMIN
    assert stored.is_active is True
    assert stored.created_at is not None


@pytest.mark.asyncio
async def test_duplicate_email_raises_integrity_error(session):
    first = User(
        email="duplicate@autohire.co.ke",
        full_name="First User",
        password_hash="hash-one",
    )
    session.add(first)
    await session.commit()

    second = User(
        email="duplicate@autohire.co.ke",
        full_name="Second User",
        password_hash="hash-two",
    )
    session.add(second)

    with pytest.raises(IntegrityError):
        await session.commit()

    await session.rollback()
