"""ORM models package.

Importing this package registers every model with `Base.metadata`, so
Alembic and `create_all()` can discover all tables.
"""

from app.models.user import User, UserRole

__all__ = ["User", "UserRole"]
