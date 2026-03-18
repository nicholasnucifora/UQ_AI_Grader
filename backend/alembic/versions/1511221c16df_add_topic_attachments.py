"""add_topic_attachments

Revision ID: 1511221c16df
Revises: b1f3a9c2e084
Create Date: 2026-03-12 17:17:48.540684

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1511221c16df'
down_revision: Union[str, None] = 'b1f3a9c2e084'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'topic_attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('topic', sa.String(256), nullable=False),
        sa.Column('filename', sa.String(512), nullable=False),
        sa.Column('content_text', sa.Text(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_topic_attachments_assignment_id', 'topic_attachments', ['assignment_id'])
    op.create_index('ix_topic_attachments_topic', 'topic_attachments', ['topic'])


def downgrade() -> None:
    op.drop_index('ix_topic_attachments_topic', 'topic_attachments')
    op.drop_index('ix_topic_attachments_assignment_id', 'topic_attachments')
    op.drop_table('topic_attachments')
