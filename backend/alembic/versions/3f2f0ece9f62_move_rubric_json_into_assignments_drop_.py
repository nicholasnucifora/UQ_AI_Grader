"""move rubric_json into assignments, drop rubrics table

Revision ID: 3f2f0ece9f62
Revises: da62e8cd661e
Create Date: 2026-03-09 16:04:24.747754

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f2f0ece9f62'
down_revision: Union[str, None] = 'da62e8cd661e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import text

    op.add_column('assignments', sa.Column('rubric_json', sa.Text(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(text("SELECT assignment_id, rubric_json FROM rubrics")).fetchall()
    for row in rows:
        conn.execute(
            text("UPDATE assignments SET rubric_json = :j WHERE id = :id"),
            {"j": row.rubric_json, "id": row.assignment_id},
        )

    op.drop_table('rubrics')


def downgrade() -> None:
    from sqlalchemy import text

    op.create_table(
        'rubrics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('rubric_json', sa.Text(), nullable=False),
        sa.Column('is_approved', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('assignment_id'),
    )

    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT id, rubric_json FROM assignments WHERE rubric_json IS NOT NULL")
    ).fetchall()
    for row in rows:
        conn.execute(
            text(
                "INSERT INTO rubrics (assignment_id, rubric_json, is_approved, created_at, updated_at) "
                "VALUES (:aid, :j, 1, datetime('now'), datetime('now'))"
            ),
            {"aid": row.id, "j": row.rubric_json},
        )

    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_column('rubric_json')
