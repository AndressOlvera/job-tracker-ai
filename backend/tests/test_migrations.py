from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from flask_migrate import downgrade, upgrade
from sqlalchemy import CheckConstraint, inspect, text

from app.extensions import db
from app.models import Application


def test_models_and_migrations_do_not_diverge(app):
    with app.app_context(), db.engine.connect() as connection:
        context = MigrationContext.configure(
            connection, opts={"compare_type": True, "compare_server_default": True}
        )

        assert compare_metadata(context, db.metadata) == []


def test_check_constraints_match_model(app):
    # Autogenerate no compara los CHECK, así que se revisan aparte.
    expected = {
        constraint.name
        for constraint in Application.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }
    with app.app_context():
        found = {c["name"] for c in inspect(db.engine).get_check_constraints("applications")}

    assert found == expected


def test_indexes_match_reference_sql(app):
    query = text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'applications'")
    with app.app_context(), db.engine.connect() as connection:
        indexes = {name: definition for name, definition in connection.execute(query)}

    assert "(status)" in indexes["ix_applications_status"]
    assert "(applied_on DESC)" in indexes["ix_applications_applied_on"]


def test_downgrade_removes_table_and_upgrade_restores_it(app):
    with app.app_context():
        downgrade(revision="base")
        try:
            assert not inspect(db.engine).has_table("applications")
        finally:
            upgrade()

        assert inspect(db.engine).has_table("applications")
