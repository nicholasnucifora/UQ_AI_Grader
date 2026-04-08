"""fix null created_at values in grade_results

Revision ID: r6s7t8u9v0w1
Revises: q5r6s7t8u9v0
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'r6s7t8u9v0w1'
down_revision = 'q5r6s7t8u9v0'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    # The previous migration may have set created_at = NULL for rows where
    # graded_at was also NULL. Fix those rows by falling back to CURRENT_TIMESTAMP.
    bind.execute(sa.text(
        'UPDATE grade_results SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL'
    ))


def downgrade():
    pass
