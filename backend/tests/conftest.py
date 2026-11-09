from collections.abc import Iterator

import pytest
from flask import Flask
from flask.testing import FlaskClient
from flask_migrate import upgrade
from sqlalchemy import text

from app import create_app
from app.extensions import db


@pytest.fixture(scope="session", autouse=True)
def _migrated_schema() -> None:
    """Crea el esquema desde cero con las migraciones reales (ADR-010)."""
    app = create_app("testing")
    with app.app_context():
        database = db.engine.url.database or ""
        assert database.endswith("_test"), f"Las pruebas borran datos; base rechazada: {database}"
        with db.engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
        upgrade()
        db.engine.dispose()


@pytest.fixture
def app() -> Iterator[Flask]:
    application = create_app("testing")
    yield application
    with application.app_context():
        db.engine.dispose()


@pytest.fixture(autouse=True)
def _empty_tables(app: Flask) -> None:
    with app.app_context(), db.engine.begin() as connection:
        tables = ", ".join(table.name for table in db.metadata.sorted_tables)
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY"))


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    return app.test_client()
