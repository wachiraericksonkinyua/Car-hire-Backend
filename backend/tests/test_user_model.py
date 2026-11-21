import pytest
from sqlalchemy.exc import IntegrityError

from app.models import User, UserRole


def test_staff_roles_are_exactly_the_five_dashboard_roles():
    assert {role.value for role in UserRole} == {
        "owner",
        "manager",
        "agent",
        "driver",
        "mechanic",
    }


@pytest.mark.asyncio
async def test_create_and_read_user(db_session):
    user = User(
        email="admin@autohire.co.ke",
        full_name="Admin User",
        password_hash="hashed-secret",
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)  # load the server-generated created_at

    stored = await db_session.get(User, user.id)

    assert stored is not None
    assert stored.email == "admin@autohire.co.ke"
    assert stored.role == UserRole.OWNER
    assert stored.is_active is True
    assert stored.created_at is not None


@pytest.mark.asyncio
async def test_duplicate_email_raises_integrity_error(db_session):
    first = User(
        email="duplicate@autohire.co.ke",
        full_name="First User",
        password_hash="hash-one",
    )
    db_session.add(first)
    await db_session.commit()

    second = User(
        email="duplicate@autohire.co.ke",
        full_name="Second User",
        password_hash="hash-two",
    )
    db_session.add(second)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()
