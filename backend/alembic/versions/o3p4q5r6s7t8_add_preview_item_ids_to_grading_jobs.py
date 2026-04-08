"""add preview_item_ids to grading_jobs

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-04-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'o3p4q5r6s7t8'
down_revision = 'n2o3p4q5r6s7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('grading_jobs')]
    if 'preview_item_ids' not in columns:
        op.add_column('grading_jobs', sa.Column('preview_item_ids', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('grading_jobs', 'preview_item_ids')
