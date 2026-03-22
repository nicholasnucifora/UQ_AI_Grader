"""add moderation_topic_attachment_instructions to assignments

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-03-20 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.add_column(sa.Column('moderation_topic_attachment_instructions', sa.Text(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('moderation_topic_attachment_instructions')
