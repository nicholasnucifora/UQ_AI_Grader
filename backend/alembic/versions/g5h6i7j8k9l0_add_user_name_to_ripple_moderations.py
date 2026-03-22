"""add user_name to ripple_moderations

Revision ID: g5h6i7j8k9l0
Revises: f4a5b6c7d8e9
Create Date: 2026-03-21

"""
from alembic import op
import sqlalchemy as sa

revision = "g5h6i7j8k9l0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ripple_moderations",
        sa.Column("user_name", sa.String(256), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("ripple_moderations", "user_name")
