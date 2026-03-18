"""add result_type and ripple_moderation_id to grade_results

Revision ID: ca421ad0bdfa
Revises: fde07b8b528a
Create Date: 2026-03-05 14:02:47.713006

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect, text


# revision identifiers, used by Alembic.
revision: str = 'ca421ad0bdfa'
down_revision: Union[str, None] = 'fde07b8b528a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)

    existing_cols = {col["name"] for col in inspector.get_columns("grade_results")}

    # Add result_type — DEFAULT clause satisfies SQLite's NOT NULL requirement for
    # existing rows. All prior rows are resource grades so 'resource' is correct.
    if "result_type" not in existing_cols:
        bind.execute(text(
            "ALTER TABLE grade_results ADD COLUMN result_type VARCHAR(32) NOT NULL DEFAULT 'resource'"
        ))

    # Add ripple_moderation_id — nullable, set only for moderation grade rows.
    if "ripple_moderation_id" not in existing_cols:
        bind.execute(text(
            "ALTER TABLE grade_results ADD COLUMN ripple_moderation_id INTEGER"
        ))

    # Drop the unique index if it still exists.
    # In SQLite a UNIQUE constraint is stored as an index and can be removed with DROP INDEX.
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("grade_results")}
    if "uq_grade_result_assignment_resource" in existing_indexes:
        bind.execute(text("DROP INDEX uq_grade_result_assignment_resource"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("grade_results")}
    if "uq_grade_result_assignment_resource" not in existing_indexes:
        bind.execute(text(
            "CREATE UNIQUE INDEX uq_grade_result_assignment_resource "
            "ON grade_results (assignment_id, ripple_resource_id)"
        ))

    # SQLite has no DROP COLUMN before 3.35; use batch mode for the removal.
    with op.batch_alter_table('grade_results', schema=None) as batch_op:
        batch_op.drop_column('result_type')
        batch_op.drop_column('ripple_moderation_id')
