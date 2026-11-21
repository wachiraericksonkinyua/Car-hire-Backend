"""staff avatars and driver photos

Revision ID: 7c1f0a9d2e44
Revises: 68b25110f83b
Create Date: 2026-11-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7c1f0a9d2e44"
down_revision: Union[str, Sequence[str], None] = "68b25110f83b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "driver_profiles",
        sa.Column("photo_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("driver_profiles", "photo_url")
    op.drop_column("users", "avatar_url")
