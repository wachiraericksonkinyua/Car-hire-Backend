"""Create the first owner account.

Run from `backend` after setting OWNER_DEFAULT_PASSWORD using a secure method.
The secret is required; this script never falls back to a built-in password.
"""

import asyncio
import os

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole

OWNER_EMAIL = "owner@autohire.ke"


def _initial_password() -> str:
    password = os.getenv("OWNER_DEFAULT_PASSWORD", "")
    if not password.strip() or len(password) < 12:
        raise RuntimeError(
            "Set OWNER_DEFAULT_PASSWORD to a secret at least 12 characters "
            "long before creating the owner account."
        )
    return password


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
            password_hash=hash_password(_initial_password()),
            role=UserRole.OWNER,
            is_active=True,
        )

        db.add(owner)
        await db.commit()

        print(f"Created owner account: {OWNER_EMAIL}")
        print("Keep the initial password in a password manager.")


if __name__ == "__main__":
    asyncio.run(seed_owner())
