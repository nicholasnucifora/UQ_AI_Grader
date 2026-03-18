"""add is_preview to grading_jobs

Revision ID: d7c74f73f53d
Revises: e252b2ac2e77
Create Date: 2026-03-13 11:01:07.700473

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7c74f73f53d'
down_revision: Union[str, None] = 'e252b2ac2e77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('grading_jobs', sa.Column('is_preview', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('grading_jobs', sa.Column('preview_sample_size', sa.Integer(), nullable=False, server_default='3'))


def downgrade() -> None:
    op.drop_column('grading_jobs', 'preview_sample_size')
    op.drop_column('grading_jobs', 'is_preview')
