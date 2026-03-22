"""add grade scale and combine grade settings to assignments

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.add_column(sa.Column('grade_scale_enabled', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('grade_scale_max', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('grade_rounding', sa.String(16), nullable=False, server_default='none'))
        batch_op.add_column(sa.Column('grade_decimal_places', sa.Integer(), nullable=False, server_default='2'))
        batch_op.add_column(sa.Column('combine_resource_grades', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('combine_moderation_grades', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('combine_moderation_grades')
        batch_op.drop_column('combine_resource_grades')
        batch_op.drop_column('grade_decimal_places')
        batch_op.drop_column('grade_rounding')
        batch_op.drop_column('grade_scale_max')
        batch_op.drop_column('grade_scale_enabled')
