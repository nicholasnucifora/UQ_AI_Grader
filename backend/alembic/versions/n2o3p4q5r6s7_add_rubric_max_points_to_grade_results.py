"""add rubric_max_points_json to grade_results

Revision ID: n2o3p4q5r6s7
Revises: l0m1n2o3p4q5
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'n2o3p4q5r6s7'
down_revision = 'l0m1n2o3p4q5'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('grade_results')]
    if 'rubric_max_points_json' not in columns:
        op.add_column('grade_results', sa.Column('rubric_max_points_json', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('grade_results', 'rubric_max_points_json')
