"""vehicle photo captions

Revision ID: c3e5f7a9b1d2
Revises: b2d4e6f8a0c1
Create Date: 2026-11-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3e5f7a9b1d2"
down_revision: Union[str, Sequence[str], None] = "b2d4e6f8a0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vehicle_photos",
        sa.Column("caption", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicle_photos", "caption")
