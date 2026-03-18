"""add ai_model, response_detail, use_topic_attachments, topic_attachment_instructions to assignments

Revision ID: a1b2c3d4e5f6
Revises: d7c74f73f53d
Create Date: 2026-03-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd7c74f73f53d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assignments', sa.Column('ai_model', sa.String(length=64), nullable=False, server_default='claude-haiku-4-5-20251001'))
    op.add_column('assignments', sa.Column('response_detail', sa.String(length=16), nullable=False, server_default='standard'))
    op.add_column('assignments', sa.Column('use_topic_attachments', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('assignments', sa.Column('topic_attachment_instructions', sa.Text(), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('assignments', 'topic_attachment_instructions')
    op.drop_column('assignments', 'use_topic_attachments')
    op.drop_column('assignments', 'response_detail')
    op.drop_column('assignments', 'ai_model')
