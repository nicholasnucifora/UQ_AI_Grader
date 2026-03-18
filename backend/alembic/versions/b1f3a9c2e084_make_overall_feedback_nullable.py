"""make overall_feedback nullable in grade_results

Revision ID: b1f3a9c2e084
Revises: 9d2876835ab3
Create Date: 2026-03-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1f3a9c2e084'
down_revision: Union[str, None] = '9d2876835ab3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('grade_results') as batch_op:
        batch_op.alter_column(
            'overall_feedback',
            existing_type=sa.Text(),
            nullable=True,
            server_default=None,
        )


def downgrade() -> None:
    with op.batch_alter_table('grade_results') as batch_op:
        batch_op.alter_column(
            'overall_feedback',
            existing_type=sa.Text(),
            nullable=False,
            server_default='',
        )
