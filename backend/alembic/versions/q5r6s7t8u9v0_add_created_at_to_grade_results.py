"""add created_at to grade_results

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'q5r6s7t8u9v0'
down_revision = 'p4q5r6s7t8u9'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c['name'] for c in inspector.get_columns('grade_results')]
    if 'created_at' not in cols:
        # SQLite does not allow ADD COLUMN with a non-constant default (e.g. CURRENT_TIMESTAMP).
        # Add the column as nullable; the UPDATE below backfills real values for existing rows,
        # and new rows will always have created_at set by the application.
        op.add_column('grade_results', sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ))
        # Backfill: use graded_at where available, fall back to CURRENT_TIMESTAMP
        bind.execute(sa.text('UPDATE grade_results SET created_at = COALESCE(graded_at, CURRENT_TIMESTAMP)'))


def downgrade():
    op.drop_column('grade_results', 'created_at')
