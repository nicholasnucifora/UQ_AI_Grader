"""add topic_cutoff_dates and has_extension columns

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-04-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'p4q5r6s7t8u9'
down_revision = 'o3p4q5r6s7t8'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    assignment_cols = [c['name'] for c in inspector.get_columns('assignments')]
    if 'topic_cutoff_dates' not in assignment_cols:
        op.add_column('assignments', sa.Column('topic_cutoff_dates', sa.JSON(), nullable=True))

    resource_cols = [c['name'] for c in inspector.get_columns('ripple_resources')]
    if 'has_extension' not in resource_cols:
        op.add_column('ripple_resources', sa.Column('has_extension', sa.Boolean(), nullable=False, server_default='0'))

    moderation_cols = [c['name'] for c in inspector.get_columns('ripple_moderations')]
    if 'has_extension' not in moderation_cols:
        op.add_column('ripple_moderations', sa.Column('has_extension', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('assignments', 'topic_cutoff_dates')
    op.drop_column('ripple_resources', 'has_extension')
    op.drop_column('ripple_moderations', 'has_extension')
