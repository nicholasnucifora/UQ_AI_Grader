"""add job_id to grade_results

Revision ID: k9l0m1n2o3p4
Revises: j8k9l0m1n2o3
Create Date: 2026-03-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'k9l0m1n2o3p4'
down_revision = 'j8k9l0m1n2o3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('grade_results')]
    if 'job_id' not in columns:
        op.add_column('grade_results', sa.Column('job_id', sa.Integer(), nullable=True))
    indexes = [i['name'] for i in inspector.get_indexes('grade_results')]
    if 'ix_grade_results_job_id' not in indexes:
        op.create_index('ix_grade_results_job_id', 'grade_results', ['job_id'])
    # SQLite does not support adding FK constraints after table creation; skip.


def downgrade():
    op.drop_index('ix_grade_results_job_id', table_name='grade_results')
    op.drop_column('grade_results', 'job_id')
