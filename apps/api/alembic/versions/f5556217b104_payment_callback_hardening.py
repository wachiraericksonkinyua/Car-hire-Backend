"""payment callback hardening

Revision ID: f5556217b104
Revises: 33e45a50ff2e
Create Date: 2026-11-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f5556217b104"
down_revision: Union[str, Sequence[str], None] = "33e45a50ff2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'Mismatched'"
    )
    op.add_column(
        "payments",
        sa.Column(
            "refund_required",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("payments", "refund_required")
    # PostgreSQL cannot remove a value from an enum type; 'Mismatched' stays.
