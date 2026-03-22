"""add separate moderation grade scale settings to assignments

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-03-20 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.add_column(sa.Column('separate_moderation_grade_scale', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('moderation_grade_scale_max', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('moderation_grade_rounding', sa.String(16), nullable=False, server_default='none'))
        batch_op.add_column(sa.Column('moderation_grade_decimal_places', sa.Integer(), nullable=False, server_default='2'))


def downgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('moderation_grade_decimal_places')
        batch_op.drop_column('moderation_grade_rounding')
        batch_op.drop_column('moderation_grade_scale_max')
        batch_op.drop_column('separate_moderation_grade_scale')
