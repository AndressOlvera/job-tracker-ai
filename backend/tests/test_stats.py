from datetime import date

import pytest

from app import clock

STATS = "/api/v1/stats"


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "today", lambda: date(2026, 10, 3))


def _create(client, status="applied", applied_on="2026-09-15"):
    response = client.post(
        "/api/v1/applications",
        json={"company": "A", "position": "B", "status": status, "applied_on": applied_on},
    )
    assert response.status_code == 201


def _stats(client):
    response = client.get(STATS)
    assert response.status_code == 200
    return response.get_json()


def test_stats_without_data(client):
    assert _stats(client) == {
        "total": 0,
        "by_status": {"applied": 0, "interview": 0, "offer": 0, "rejected": 0},
        "response_rate": 0,
        "interview_rate": 0,
        "by_month": [],
    }


def test_stats_match_documented_example(client):
    rows = {"applied": 15, "interview": 5, "offer": 1, "rejected": 3}
    statuses = [status for status, count in rows.items() for _ in range(count)]
    for index, status in enumerate(statuses):
        _create(client, status, "2026-08-10" if index % 4 == 0 else "2026-09-10")

    assert _stats(client) == {
        "total": 24,
        "by_status": rows,
        "response_rate": 0.375,
        "interview_rate": 0.25,
        "by_month": [{"month": "2026-08", "count": 6}, {"month": "2026-09", "count": 18}],
    }


def test_by_status_includes_missing_statuses_as_zero(client):
    _create(client, "offer")

    assert _stats(client)["by_status"] == {"applied": 0, "interview": 0, "offer": 1, "rejected": 0}


def test_rates_are_rounded_to_four_decimals(client):
    for status in ("applied", "interview", "rejected"):
        _create(client, status)

    stats = _stats(client)

    assert stats["response_rate"] == 0.6667
    assert stats["interview_rate"] == 0.3333


def test_offers_count_as_interviews_and_rejected_does_not(client):
    _create(client, "offer")
    _create(client, "rejected")

    stats = _stats(client)

    assert stats["interview_rate"] == 0.5
    assert stats["response_rate"] == 1


def test_by_month_is_chronological_across_years_and_skips_empty_months(client):
    for applied_on in ("2026-03-01", "2025-12-31", "2026-03-31", "2025-01-15"):
        _create(client, applied_on=applied_on)

    assert _stats(client)["by_month"] == [
        {"month": "2025-01", "count": 1},
        {"month": "2025-12", "count": 1},
        {"month": "2026-03", "count": 2},
    ]


def test_deleted_applications_leave_the_stats(client):
    _create(client)
    item = client.get("/api/v1/applications").get_json()["items"][0]

    client.delete(f"/api/v1/applications/{item['id']}")

    assert _stats(client)["total"] == 0


def test_stats_rejects_other_methods(client):
    assert client.post(STATS).status_code == 405
