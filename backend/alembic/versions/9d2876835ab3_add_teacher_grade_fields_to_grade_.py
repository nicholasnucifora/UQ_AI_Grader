"""add teacher grade fields to grade_results

Revision ID: 9d2876835ab3
Revises: 3f2f0ece9f62
Create Date: 2026-03-10 00:26:33.570949

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d2876835ab3'
down_revision: Union[str, None] = '3f2f0ece9f62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('grade_results', sa.Column('teacher_criterion_grades', sa.JSON(), nullable=True))
    op.add_column('grade_results', sa.Column('teacher_overall_feedback', sa.Text(), nullable=True))
    op.add_column('grade_results', sa.Column('teacher_graded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('grade_results', sa.Column('teacher_graded_by', sa.String(length=256), nullable=True))


def downgrade() -> None:
    op.drop_column('grade_results', 'teacher_graded_by')
    op.drop_column('grade_results', 'teacher_graded_at')
    op.drop_column('grade_results', 'teacher_overall_feedback')
    op.drop_column('grade_results', 'teacher_criterion_grades')
