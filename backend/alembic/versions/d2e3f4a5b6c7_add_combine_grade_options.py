"""add combine grade max_n and scope options to assignments

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-20 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.add_column(sa.Column('combine_resource_max_n', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('combine_moderation_max_n', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('combine_scope', sa.String(16), nullable=False, server_default='topic'))


def downgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('combine_scope')
        batch_op.drop_column('combine_moderation_max_n')
        batch_op.drop_column('combine_resource_max_n')
