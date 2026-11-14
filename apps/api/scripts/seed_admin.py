"""Create the first admin account.

Run from `apps/api` with:

    python -m scripts.seed_admin

You can override the starting password (recommended) with:

    ADMIN_DEFAULT_PASSWORD='something-strong' python -m scripts.seed_admin
"""

import asyncio
import os

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole

ADMIN_EMAIL = "admin@autohire.ke"

# Dev-only fallback. Always set ADMIN_DEFAULT_PASSWORD in real environments,
# and change this password after the first login.
DEFAULT_PASSWORD = os.getenv("ADMIN_DEFAULT_PASSWORD", "ChangeMe-2026!")


async def seed_admin() -> None:
    """Insert an admin user if one does not already exist."""
    async with SessionLocal() as db:
        existing = await db.scalar(
            select(User).where(User.email == ADMIN_EMAIL)
        )

        if existing is not None:
            print(f"Admin {ADMIN_EMAIL} already exists; nothing to do.")
            return

        admin = User(
            email=ADMIN_EMAIL,
            full_name="AutoHire Admin",
            # Never store the plain password: only the Argon2 hash.
            password_hash=hash_password(DEFAULT_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
        )

        db.add(admin)
        await db.commit()

        print(f"Created admin account: {ADMIN_EMAIL}")
        print("Change the password after your first login!")


if __name__ == "__main__":
    asyncio.run(seed_admin())
