"""Persist staff and driver profile photos in PostgreSQL.

Revision ID: d9e4a6b8c2f1
Revises: c3e5f7a9b1d2
Create Date: 2026-11-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d9e4a6b8c2f1"
down_revision: Union[str, Sequence[str], None] = "c3e5f7a9b1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_data", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users",
        sa.Column("avatar_content_type", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "driver_profiles",
        sa.Column("photo_data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "driver_profiles",
        sa.Column("photo_content_type", sa.String(length=60), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("driver_profiles", "photo_content_type")
    op.drop_column("driver_profiles", "photo_data")
    op.drop_column("users", "avatar_content_type")
    op.drop_column("users", "avatar_data")
