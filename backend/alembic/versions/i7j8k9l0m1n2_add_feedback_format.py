"""add feedback_format to assignments

Revision ID: i7j8k9l0m1n2
Revises: h6i7j8k9l0m1
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa

revision = 'i7j8k9l0m1n2'
down_revision = 'h6i7j8k9l0m1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('assignments', sa.Column('feedback_format', sa.Text(), nullable=True, server_default=''))


def downgrade():
    op.drop_column('assignments', 'feedback_format')
