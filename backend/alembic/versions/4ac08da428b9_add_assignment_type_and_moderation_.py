"""add assignment_type and moderation fields

Revision ID: 4ac08da428b9
Revises: 79905bceeb5f
Create Date: 2026-03-09 15:03:48.485687

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ac08da428b9'
down_revision: Union[str, None] = '79905bceeb5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # assignment columns were partially applied in a prior interrupted run;
    # add them only if they don't already exist (SQLite workaround via batch)
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.add_column(sa.Column('assignment_type', sa.String(length=32), nullable=False, server_default='resources'))
        batch_op.add_column(sa.Column('same_rubric_for_moderation', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('same_ai_options_for_moderation', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('moderation_strictness', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column('moderation_additional_notes', sa.Text(), nullable=True))
    op.add_column('rubrics', sa.Column('moderation_rubric_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('rubrics', 'moderation_rubric_json')
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('moderation_additional_notes')
        batch_op.drop_column('moderation_strictness')
        batch_op.drop_column('same_ai_options_for_moderation')
        batch_op.drop_column('same_rubric_for_moderation')
        batch_op.drop_column('assignment_type')
