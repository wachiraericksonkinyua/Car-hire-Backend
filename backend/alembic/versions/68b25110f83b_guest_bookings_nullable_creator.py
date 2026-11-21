"""guest bookings nullable creator

Revision ID: 68b25110f83b
Revises: 548a49718ef1
Create Date: 2026-11-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "68b25110f83b"
down_revision: Union[str, Sequence[str], None] = "548a49718ef1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "bookings", "created_by_id", existing_type=None, nullable=True
    )


def downgrade() -> None:
    # Only safe if there are no guest bookings.
    op.alter_column(
        "bookings", "created_by_id", existing_type=None, nullable=False
    )
