from collections import Counter
from datetime import date

import pytest
from sqlalchemy import select

from app import clock, create_app
from app.extensions import db
from app.models import APPLICATION_STATUSES, Application
from app.schemas import ApplicationCreate

TODAY = date(2026, 1, 15)


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "today", lambda: TODAY)


def _seed(app, *args):
    result = app.test_cli_runner().invoke(args=["seed", *args])
    assert result.exit_code == 0, result.output
    return result.output


def _rows(app) -> list[Application]:
    with app.app_context():
        rows = list(db.session.scalars(select(Application)))
        db.session.expunge_all()
    return rows


def test_seed_loads_more_than_one_page(app):
    output = _seed(app)

    assert "Se cargaron 24" in output
    assert len(_rows(app)) == 24 > 20


def test_seed_covers_all_statuses_and_several_months(app):
    _seed(app)
    rows = _rows(app)

    assert set(Counter(row.status for row in rows)) == set(APPLICATION_STATUSES)
    assert len({(row.applied_on.year, row.applied_on.month) for row in rows}) >= 5


def test_seed_dates_are_never_future(app):
    _seed(app)

    assert max(row.applied_on for row in _rows(app)) <= TODAY


def test_seed_rows_pass_api_validation(app):
    _seed(app)

    with app.app_context():
        for row in _rows(app):
            ApplicationCreate.model_validate(
                {
                    "company": row.company,
                    "position": row.position,
                    "status": row.status,
                    "applied_on": row.applied_on.isoformat(),
                    "job_url": row.job_url,
                    "source": row.source,
                    "notes": row.notes,
                }
            )


def test_seed_only_uses_reserved_urls(app):
    _seed(app)

    assert all(row.job_url.startswith("https://example.com/") for row in _rows(app))


def test_second_seed_neither_duplicates_nor_deletes(app):
    _seed(app)
    before = {row.id for row in _rows(app)}

    output = _seed(app)

    assert "no se insertó nada" in output
    assert {row.id for row in _rows(app)} == before


def test_seed_preserves_existing_user_data(app, client):
    client.post("/api/v1/applications", json={"company": "Mía", "position": "Propia"})

    assert "ya tiene 1 postulaciones" in _seed(app)
    assert [row.company for row in _rows(app)] == ["Mía"]


def test_reset_replaces_existing_rows(app, client):
    client.post("/api/v1/applications", json={"company": "Mía", "position": "Propia"})

    assert "Se cargaron 24" in _seed(app, "--reset")

    rows = _rows(app)
    assert len(rows) == 24
    assert "Mía" not in {row.company for row in rows}


def test_reset_on_empty_table_loads_data(app):
    _seed(app, "--reset")

    assert len(_rows(app)) == 24


def test_seed_runs_with_production_config(monkeypatch: pytest.MonkeyPatch, app):
    monkeypatch.setenv("DATABASE_URL", app.config["SQLALCHEMY_DATABASE_URI"])
    production = create_app("production")

    result = production.test_cli_runner().invoke(args=["seed"])

    assert result.exit_code == 0, result.output
    assert "Se cargaron 24" in result.output
    with production.app_context():
        db.engine.dispose()
