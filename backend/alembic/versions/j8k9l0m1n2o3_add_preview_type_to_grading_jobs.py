"""add preview_type to grading_jobs

Revision ID: j8k9l0m1n2o3
Revises: i7j8k9l0m1n2
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa

revision = 'j8k9l0m1n2o3'
down_revision = 'i7j8k9l0m1n2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('grading_jobs', sa.Column('preview_type', sa.String(32), nullable=True))


def downgrade():
    op.drop_column('grading_jobs', 'preview_type')
