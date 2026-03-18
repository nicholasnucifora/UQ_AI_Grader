"""consolidate rubric json into single envelope column

Revision ID: da62e8cd661e
Revises: 4ac08da428b9
Create Date: 2026-03-09 15:46:00.323958

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da62e8cd661e'
down_revision: Union[str, None] = '4ac08da428b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import json
    from sqlalchemy import text

    conn = op.get_bind()

    # Reshape existing rows: wrap bare rubric_json into envelope format,
    # merging any moderation_rubric_json that was stored in the old column.
    rows = conn.execute(text("SELECT id, rubric_json, moderation_rubric_json FROM rubrics")).fetchall()
    for row in rows:
        data = json.loads(row.rubric_json)
        # Already in envelope format — skip
        if "resource" in data:
            continue
        mod_raw = row.moderation_rubric_json
        envelope = {
            "resource": data,
            "moderation": json.loads(mod_raw) if mod_raw else None,
        }
        conn.execute(
            text("UPDATE rubrics SET rubric_json = :j WHERE id = :id"),
            {"j": json.dumps(envelope), "id": row.id},
        )

    # Drop the now-redundant column (batch mode required for SQLite)
    with op.batch_alter_table("rubrics") as batch_op:
        batch_op.drop_column("moderation_rubric_json")


def downgrade() -> None:
    import json
    from sqlalchemy import text

    # Re-add the column and split the envelope back out
    op.add_column("rubrics", sa.Column("moderation_rubric_json", sa.Text(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, rubric_json FROM rubrics")).fetchall()
    for row in rows:
        data = json.loads(row.rubric_json)
        if "resource" not in data:
            continue
        mod = data.get("moderation")
        conn.execute(
            text("UPDATE rubrics SET rubric_json = :r, moderation_rubric_json = :m WHERE id = :id"),
            {
                "r": json.dumps(data["resource"]),
                "m": json.dumps(mod) if mod else None,
                "id": row.id,
            },
        )
