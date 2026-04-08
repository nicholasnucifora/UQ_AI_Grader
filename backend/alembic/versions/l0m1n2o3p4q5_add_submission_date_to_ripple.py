"""add submission date to ripple resources and moderations

Revision ID: l0m1n2o3p4q5
Revises: k9l0m1n2o3p4
Create Date: 2026-04-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'l0m1n2o3p4q5'
down_revision = 'k9l0m1n2o3p4'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    res_cols = [c['name'] for c in inspector.get_columns('ripple_resources')]
    if 'timestamp' not in res_cols:
        op.add_column('ripple_resources', sa.Column('timestamp', sa.String(64), nullable=True))

    mod_cols = [c['name'] for c in inspector.get_columns('ripple_moderations')]
    if 'created_at' not in mod_cols:
        op.add_column('ripple_moderations', sa.Column('created_at', sa.String(64), nullable=True))


def downgrade():
    op.drop_column('ripple_resources', 'timestamp')
    op.drop_column('ripple_moderations', 'created_at')
