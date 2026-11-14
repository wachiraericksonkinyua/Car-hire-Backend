"""driver assignment and trip status

Revision ID: bf6ee136b967
Revises: f3174f8d274b
Create Date: 2026-11-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "bf6ee136b967"
down_revision: Union[str, Sequence[str], None] = "f3174f8d274b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings", sa.Column("driver_id", sa.Uuid(), nullable=True)
    )
    op.execute(
        "CREATE TYPE trip_status AS ENUM "
        "('Assigned', 'EnRoute', 'CustomerOnboard', 'Completed')"
    )
    op.add_column(
        "bookings",
        sa.Column(
            "trip_status",
            postgresql.ENUM(
                "Assigned",
                "EnRoute",
                "CustomerOnboard",
                "Completed",
                name="trip_status",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.create_index(
        op.f("ix_bookings_driver_id"),
        "bookings",
        ["driver_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_bookings_driver_id_driver_profiles",
        "bookings",
        "driver_profiles",
        ["driver_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_bookings_driver_id_driver_profiles",
        "bookings",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_bookings_driver_id"), table_name="bookings")
    op.drop_column("bookings", "trip_status")
    op.drop_column("bookings", "driver_id")
    op.execute("DROP TYPE IF EXISTS trip_status")
