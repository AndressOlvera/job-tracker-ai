"""Huecos de test_applications_list.py: filas creadas juntas, empates reales y bordes de la URL."""

from datetime import date

import pytest

from app.extensions import db
from app.models import Application

BASE = "/api/v1/applications"
SORTS = ["applied_on", "company", "status", "created_at"]


def _seed(app, rows: list[dict]) -> None:
    # Una sola transacción: now() es igual para todas, así que created_at también empata.
    with app.app_context():
        for row in rows:
            db.session.add(
                Application(
                    **{
                        "company": "Empate",
                        "position": "Tie",
                        "applied_on": date(2026, 6, 1),
                        **row,
                    }
                )
            )
        db.session.commit()


def _list(client, **params) -> dict:
    response = client.get(BASE, query_string=params)
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()


def _ids(result: dict) -> list[int]:
    return [item["id"] for item in result["items"]]


@pytest.mark.parametrize("sort", [*SORTS, *[f"-{field}" for field in SORTS]])
def test_pagination_with_ties_neither_repeats_nor_skips(app, client, sort: str):
    _seed(app, [{} for _ in range(23)])

    first = _list(client, sort=sort, per_page=5)
    pages = [first, *[_list(client, sort=sort, per_page=5, page=n) for n in range(2, 6)]]
    walked = [item_id for page in pages for item_id in _ids(page)]

    assert first["total"] == 23
    assert first["pages"] == 5
    assert walked == sorted(walked, reverse=sort.startswith("-"))
    assert len(set(walked)) == 23


@pytest.mark.parametrize(("sort", "reverse"), [("company", False), ("-company", True)])
def test_company_differing_only_in_case_ties_by_id(app, client, sort: str, reverse: bool):
    _seed(app, [{"company": name} for name in ("Oracle", "oracle", "ORACLE")])

    ids = _ids(_list(client, sort=sort))

    assert ids == sorted(ids, reverse=reverse)


def test_per_page_100_caps_a_larger_result(app, client):
    _seed(app, [{} for _ in range(101)])

    result = _list(client, per_page=100)

    assert len(result["items"]) == 100
    assert result["total"] == 101
    assert result["pages"] == 2


def test_match_in_company_and_position_counts_once(app, client):
    _seed(app, [{"company": "Data Corp", "position": "Data Engineer"}])

    result = _list(client, q="data")

    assert result["total"] == 1
    assert len(result["items"]) == 1


@pytest.mark.parametrize("q", ["ÑANDÚ", "ñandú"])
def test_q_ignores_case_of_accented_letters(app, client, q: str):
    _seed(app, [{"company": "Ñandú"}, {"company": "ñandú SA"}, {"company": "IBM"}])

    assert _list(client, q=q)["total"] == 2


def test_q_does_not_ignore_accents(app, client):
    _seed(app, [{"company": "Ñandú"}, {"company": "Nandu"}])

    assert [item["company"] for item in _list(client, q="nandu")["items"]] == ["Nandu"]


def test_q_is_not_interpreted_as_sql(app, client):
    _seed(app, [{"company": "Oracle"}])

    assert _list(client, q="' OR 1=1--")["total"] == 0


def test_q_is_measured_after_trimming(client):
    assert _list(client, q="  " + "x" * 100 + "  ")["total"] == 0


def test_out_of_range_page_keeps_filtered_total(app, client):
    _seed(app, [{"status": "offer"}, {"status": "offer"}, {"status": "applied"}])

    result = _list(client, status="offer", page=9)

    assert result == {"items": [], "page": 9, "per_page": 20, "total": 2, "pages": 1}


def test_out_of_range_page_without_results_has_zero_total_and_pages(client):
    result = _list(client, q="nada", page=5)

    assert result == {"items": [], "page": 5, "per_page": 20, "total": 0, "pages": 0}


def test_all_parameters_empty_use_defaults(app, client):
    _seed(app, [{}])
    names = ["status", "q", "applied_from", "applied_to", "sort", "page", "per_page"]

    result = _list(client, **dict.fromkeys(names, ""))

    assert (result["total"], result["page"], result["per_page"]) == (1, 1, 20)


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"applied_from": "2026-09-02", "applied_to": "y"}, {"applied_to"}),
        ({"applied_from": "x", "applied_to": "2026-09-02"}, {"applied_from"}),
        ({"applied_from": "x", "applied_to": "y"}, {"applied_from", "applied_to"}),
    ],
)
def test_malformed_date_pair_reports_only_malformed_fields(client, params: dict, expected: set):
    response = client.get(BASE, query_string=params)

    assert response.status_code == 422
    assert set(response.get_json()["error"]["details"]) == expected


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("page", "1\n"),
        ("page", " 1"),
        ("per_page", " 5"),
        ("per_page", "5\n"),
        ("applied_from", "2026-09-01\n"),
        ("applied_to", " 2026-09-01"),
        ("status", " "),
        ("sort", "+company"),
    ],
)
def test_whitespace_in_strict_parameters_is_rejected(client, name: str, value: str):
    response = client.get(BASE, query_string={name: value})

    assert response.status_code == 422
    assert list(response.get_json()["error"]["details"]) == [name]
