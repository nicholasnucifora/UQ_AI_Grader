"""drop_unique_constraint_grade_results_assignment_resource

Revision ID: 79905bceeb5f
Revises: ca421ad0bdfa
Create Date: 2026-03-05 16:56:48.767501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79905bceeb5f'
down_revision: Union[str, None] = 'ca421ad0bdfa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The previous migration attempted to drop the unique constraint on
    # (assignment_id, ripple_resource_id) via raw SQL DROP INDEX but it did
    # not take effect.  batch_alter_table does a full copy-and-move which
    # guarantees the constraint is gone in the rebuilt table.
    # No columns are being added here so there is no circular-dependency risk.
    with op.batch_alter_table("grade_results", schema=None) as batch_op:
        # Drop the constraint if it still exists; batch mode will simply not
        # include it in the rebuilt table definition regardless.
        try:
            batch_op.drop_constraint(
                "uq_grade_result_assignment_resource", type_="unique"
            )
        except Exception:
            pass  # already gone — no-op


def downgrade() -> None:
    with op.batch_alter_table("grade_results", schema=None) as batch_op:
        batch_op.create_unique_constraint(
            "uq_grade_result_assignment_resource",
            ["assignment_id", "ripple_resource_id"],
        )
