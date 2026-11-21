"""Create the first owner account.

Run from `backend` with:

    python -m scripts.seed_owner

Override the starting password with:

    OWNER_DEFAULT_PASSWORD='something-strong' python -m scripts.seed_owner
"""

import asyncio
import os

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole

OWNER_EMAIL = "owner@autohire.ke"


def _default_password() -> str:
    return os.getenv("OWNER_DEFAULT_PASSWORD", "ChangeMe-2026!")


async def seed_owner() -> None:
    """Insert the owner if one does not already exist."""
    async with SessionLocal() as db:
        existing = await db.scalar(
            select(User).where(User.email == OWNER_EMAIL)
        )

        if existing is not None:
            print(f"Owner {OWNER_EMAIL} already exists; nothing to do.")
            return

        owner = User(
            email=OWNER_EMAIL,
            full_name="AutoHire Owner",
            password_hash=hash_password(_default_password()),
            role=UserRole.OWNER,
            is_active=True,
        )

        db.add(owner)
        await db.commit()

        print(f"Created owner account: {OWNER_EMAIL}")
        print("Change the password after your first login!")


if __name__ == "__main__":
    asyncio.run(seed_owner())
