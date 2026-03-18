"""normalize ai_model column to tier names (haiku/sonnet/opus)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-16 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remap any rows that stored the full model ID to the new tier names
    op.execute("UPDATE assignments SET ai_model = 'haiku'  WHERE ai_model = 'claude-haiku-4-5-20251001'")
    op.execute("UPDATE assignments SET ai_model = 'sonnet' WHERE ai_model = 'claude-sonnet-4-6'")
    op.execute("UPDATE assignments SET ai_model = 'opus'   WHERE ai_model = 'claude-opus-4-6'")
    # Update the column server default
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.alter_column('ai_model', server_default='haiku')


def downgrade() -> None:
    op.execute("UPDATE assignments SET ai_model = 'claude-haiku-4-5-20251001' WHERE ai_model = 'haiku'")
    op.execute("UPDATE assignments SET ai_model = 'claude-sonnet-4-6'         WHERE ai_model = 'sonnet'")
    op.execute("UPDATE assignments SET ai_model = 'claude-opus-4-6'           WHERE ai_model = 'opus'")
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.alter_column('ai_model', server_default='claude-haiku-4-5-20251001')
