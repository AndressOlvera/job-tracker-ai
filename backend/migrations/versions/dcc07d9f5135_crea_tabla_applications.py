"""crea tabla applications

Revision ID: dcc07d9f5135
Revises:
Create Date: 2026-11-09 12:14:37.292740

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "dcc07d9f5135"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.Column("position", sa.String(length=120), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default=sa.text("'applied'"), nullable=False
        ),
        sa.Column("applied_on", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("job_url", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=60), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('applied', 'interview', 'offer', 'rejected')", name="ck_applications_status"
        ),
        sa.CheckConstraint("length(trim(company)) > 0", name="ck_applications_company_not_blank"),
        sa.CheckConstraint("length(trim(position)) > 0", name="ck_applications_position_not_blank"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_applications_applied_on",
        "applications",
        [sa.literal_column("applied_on DESC")],
        unique=False,
    )
    op.create_index("ix_applications_status", "applications", ["status"], unique=False)


def downgrade():
    op.drop_index("ix_applications_status", table_name="applications")
    op.drop_index("ix_applications_applied_on", table_name="applications")
    op.drop_table("applications")
