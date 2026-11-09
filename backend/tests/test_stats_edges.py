"""Huecos de test_stats.py: cambios por la API, zona horaria de la base y consistencia."""

import pytest
from sqlalchemy import text

from app import create_app
from app.extensions import db

APPLICATIONS = "/api/v1/applications"
STATS = "/api/v1/stats"


def _create(client, status="applied", applied_on="2026-09-15") -> int:
    response = client.post(
        APPLICATIONS,
        json={"company": "A", "position": "B", "status": status, "applied_on": applied_on},
    )
    assert response.status_code == 201
    return response.get_json()["id"]


def _stats(client) -> dict:
    response = client.get(STATS)
    assert response.status_code == 200
    return response.get_json()


def test_patching_status_changes_counts_and_rates(client):
    application_id = _create(client)
    _create(client)
    assert _stats(client)["response_rate"] == 0

    client.patch(f"{APPLICATIONS}/{application_id}", json={"status": "offer"})

    stats = _stats(client)
    assert stats["by_status"] == {"applied": 1, "interview": 0, "offer": 1, "rejected": 0}
    assert stats["response_rate"] == 0.5
    assert stats["interview_rate"] == 0.5


def test_patching_applied_on_moves_the_month(client):
    application_id = _create(client, applied_on="2026-08-31")

    client.patch(f"{APPLICATIONS}/{application_id}", json={"applied_on": "2026-09-01"})

    assert _stats(client)["by_month"] == [{"month": "2026-09", "count": 1}]


def test_deleting_updates_status_rates_and_month(client):
    _create(client, applied_on="2026-09-10")
    removed = _create(client, "rejected", "2026-08-10")

    client.delete(f"{APPLICATIONS}/{removed}")

    stats = _stats(client)
    assert stats["total"] == 1
    assert stats["by_status"]["rejected"] == 0
    assert stats["response_rate"] == 0
    assert stats["by_month"] == [{"month": "2026-09", "count": 1}]


def test_deleting_everything_returns_to_empty_stats(client):
    application_id = _create(client, "offer")

    client.delete(f"{APPLICATIONS}/{application_id}")

    assert _stats(client) == {
        "total": 0,
        "by_status": {"applied": 0, "interview": 0, "offer": 0, "rejected": 0},
        "response_rate": 0,
        "interview_rate": 0,
        "by_month": [],
    }


@pytest.mark.parametrize(
    ("applied", "interview", "expected"),
    [(6, 1, 0.1429), (5, 2, 0.2857), (1, 6, 0.8571), (0, 1, 1)],
)
def test_rates_rounded_for_other_fractions(client, applied: int, interview: int, expected: float):
    for _ in range(applied):
        _create(client)
    for _ in range(interview):
        _create(client, "interview")

    stats = _stats(client)

    assert stats["response_rate"] == expected
    assert stats["interview_rate"] == expected


def test_month_totals_add_up_to_total(client):
    for applied_on in ("2024-02-29", "2025-12-31", "2026-01-01", "2026-01-31"):
        _create(client, applied_on=applied_on)

    stats = _stats(client)

    assert sum(month["count"] for month in stats["by_month"]) == stats["total"] == 4


@pytest.mark.parametrize("zone", ["Pacific/Kiritimati", "Pacific/Pago_Pago"])
def test_month_edges_do_not_shift_with_database_timezone(
    client, monkeypatch: pytest.MonkeyPatch, zone: str
):
    for applied_on in ("2025-12-31", "2026-01-01", "2026-02-28", "2026-03-01"):
        _create(client, applied_on=applied_on)
    base_url = create_app("testing").config["SQLALCHEMY_DATABASE_URI"]
    monkeypatch.setenv("TEST_DATABASE_URL", f"{base_url}?options=-c%20timezone%3D{zone}")
    app = create_app("testing")
    with app.app_context(), db.engine.connect() as connection:
        # Sin esto la prueba pasaría aunque la zona no se hubiera aplicado.
        assert connection.scalar(text("SHOW TimeZone")) == zone

    response = app.test_client().get(STATS)

    assert [month["month"] for month in response.get_json()["by_month"]] == [
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
    ]


def test_stats_ignores_query_parameters(client):
    _create(client)
    _create(client, "offer")

    response = client.get(STATS, query_string={"status": "offer", "page": "abc"})

    assert response.status_code == 200
    assert response.get_json()["total"] == 2
