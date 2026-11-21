"""vehicle photo blobs

Revision ID: b2d4e6f8a0c1
Revises: 7c1f0a9d2e44
Create Date: 2026-11-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2d4e6f8a0c1"
down_revision: Union[str, Sequence[str], None] = "7c1f0a9d2e44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vehicle_photos",
        sa.Column("data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "vehicle_photos",
        sa.Column("content_type", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "vehicle_photos",
        sa.Column("filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "vehicle_photos",
        sa.Column("size_bytes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicle_photos", "size_bytes")
    op.drop_column("vehicle_photos", "filename")
    op.drop_column("vehicle_photos", "content_type")
    op.drop_column("vehicle_photos", "data")
