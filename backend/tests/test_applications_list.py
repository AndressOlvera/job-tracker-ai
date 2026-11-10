from datetime import date

import pytest

from app import clock

BASE = "/api/v1/applications"


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "today", lambda: date(2026, 10, 3))


def _create(client, company="Oracle", position="Becario", **fields):
    response = client.post(BASE, json={"company": company, "position": position, **fields})
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()


def _list(client, **params):
    response = client.get(BASE, query_string=params)
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()


def _companies(client, **params):
    return [item["company"] for item in _list(client, **params)["items"]]


def _details(client, **params):
    response = client.get(BASE, query_string=params)
    assert response.status_code == 422
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    return error["details"]


def test_empty_list_has_zero_total_and_pages(client):
    assert _list(client) == {"items": [], "page": 1, "per_page": 20, "total": 0, "pages": 0}


def test_items_are_full_application_objects(client):
    created = _create(client, source="OCC")

    assert _list(client)["items"] == [created]


def test_deleted_application_leaves_the_list(client):
    kept = _create(client, "Queda")
    removed = _create(client, "Se va")

    assert client.delete(f"{BASE}/{removed['id']}").status_code == 204

    assert _list(client)["items"] == [kept]


def test_default_order_is_most_recent_first(client):
    _create(client, "Vieja", applied_on="2026-01-01")
    _create(client, "Nueva", applied_on="2026-09-01")
    _create(client, "Media", applied_on="2026-05-01")

    assert _companies(client) == ["Nueva", "Media", "Vieja"]


def test_status_filter(client):
    _create(client, "A", status="interview")
    _create(client, "B", status="offer")

    assert _companies(client, status="interview") == ["A"]


@pytest.mark.parametrize("q", ["orac", "ORAC", "  orac  "])
def test_q_searches_company_case_insensitive(client, q):
    _create(client, "Oracle")
    _create(client, "IBM")

    assert _companies(client, q=q) == ["Oracle"]


def test_q_searches_position(client):
    _create(client, "A", position="Data Engineer")
    _create(client, "B", position="Backend")

    assert _companies(client, q="data") == ["A"]


@pytest.mark.parametrize(
    ("q", "expected"),
    [("%", ["100% Remoto"]), ("_", ["a_b"]), ("\\", ["c\\d"]), ("a_b", ["a_b"])],
)
def test_q_treats_wildcards_as_literal_text(client, q, expected):
    for company in ("100% Remoto", "a_b", "c\\d", "axb"):
        _create(client, company)

    assert _companies(client, q=q) == expected


def test_date_range_is_inclusive(client):
    for day in ("2026-09-01", "2026-09-15", "2026-09-30", "2026-10-01", "2026-08-31"):
        _create(client, day, applied_on=day)

    companies = _companies(client, applied_from="2026-09-01", applied_to="2026-09-30")

    assert companies == ["2026-09-30", "2026-09-15", "2026-09-01"]


def test_same_day_range_and_future_dates_are_allowed_in_filters(client):
    _create(client, "A", applied_on="2026-09-01")

    assert _companies(client, applied_from="2026-09-01", applied_to="2026-09-01") == ["A"]
    assert _companies(client, applied_to="2030-01-01") == ["A"]


def test_filters_combine(client):
    _create(client, "Oracle", status="interview", applied_on="2026-09-10")
    _create(client, "Oracle", status="offer", applied_on="2026-09-10")
    _create(client, "IBM", status="interview", applied_on="2026-09-10")
    _create(client, "Oracle", status="interview", applied_on="2026-01-10")

    result = _list(client, status="interview", q="orac", applied_from="2026-09-01")

    assert result["total"] == 1


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("company", ["apple", "Banana", "cherry"]),
        ("-company", ["cherry", "Banana", "apple"]),
    ],
)
def test_sort_by_company_ignores_case(client, sort, expected):
    for company in ("Banana", "cherry", "apple"):
        _create(client, company)

    assert _companies(client, sort=sort) == expected


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("applied_on", ["B", "A"]),
        ("-applied_on", ["A", "B"]),
        ("status", ["A", "B"]),
        ("-status", ["B", "A"]),
    ],
)
def test_sort_by_date_and_status(client, sort, expected):
    _create(client, "A", applied_on="2026-09-02", status="applied")
    _create(client, "B", applied_on="2026-09-01", status="offer")

    assert _companies(client, sort=sort) == expected


def test_sort_by_created_at(client):
    _create(client, "Primero")
    _create(client, "Segundo")

    assert _companies(client, sort="created_at") == ["Primero", "Segundo"]
    assert _companies(client, sort="-created_at") == ["Segundo", "Primero"]


@pytest.mark.parametrize(
    ("sort", "ids_reversed"),
    [("applied_on", False), ("-applied_on", True), ("company", False), ("-company", True)],
)
def test_ties_break_by_id_in_same_direction(client, sort, ids_reversed):
    ids = [_create(client, "Igual", applied_on="2026-09-01")["id"] for _ in range(3)]

    found = [item["id"] for item in _list(client, sort=sort)["items"]]

    assert found == sorted(ids, reverse=ids_reversed)


def test_pagination_splits_results_without_repeats(client):
    ids = [_create(client, applied_on="2026-09-01")["id"] for _ in range(5)]

    pages = [_list(client, per_page=2, page=page) for page in (1, 2, 3)]

    assert [len(page["items"]) for page in pages] == [2, 2, 1]
    assert all(page["total"] == 5 and page["pages"] == 3 for page in pages)
    assert [item["id"] for page in pages for item in page["items"]] == ids[::-1]


def test_default_page_size_is_twenty(client):
    for _ in range(21):
        _create(client)

    result = _list(client)

    assert len(result["items"]) == 20
    assert result["pages"] == 2


@pytest.mark.parametrize("per_page", ["1", "100", "007"])
def test_per_page_limits_are_accepted(client, per_page):
    assert _list(client, per_page=per_page)["per_page"] == int(per_page)


@pytest.mark.parametrize(
    "page", ["2", "9223372036854775807", "92233720368547758070", "9" * 50, "9" * 5000]
)
def test_page_out_of_range_returns_empty_items(client, page):
    _create(client)

    result = _list(client, page=page)

    assert result["items"] == []
    assert result["total"] == 1
    assert result["pages"] == 1


@pytest.mark.parametrize("name", ["status", "q", "applied_from", "applied_to", "sort", "page"])
def test_empty_parameter_is_ignored(client, name):
    _create(client)

    assert _list(client, **{name: ""})["total"] == 1


def test_empty_per_page_uses_default(client):
    assert _list(client, per_page="")["per_page"] == 20


def test_blank_q_is_ignored(client):
    _create(client)

    assert _list(client, q="   ")["total"] == 1


def test_unknown_parameters_are_ignored(client):
    _create(client)

    assert _list(client, foo="bar", limit="abc")["total"] == 1


def test_q_limit_of_100_characters(client):
    assert _list(client, q="x" * 100)["total"] == 0
    assert list(_details(client, q="x" * 101)) == ["q"]


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("status", "ghosted"),
        ("status", "APPLIED"),
        ("q", "a\x00b"),
        ("applied_from", "2026-02-30"),
        ("applied_from", "20260101"),
        ("applied_to", "ayer"),
        ("sort", "position"),
        ("sort", "--company"),
        ("sort", "-"),
        ("sort", "id"),
        ("page", "0"),
        ("page", "-1"),
        ("page", "1.5"),
        ("page", "abc"),
        ("page", "+1"),
        ("page", "٣"),
        ("per_page", "0"),
        ("per_page", "101"),
        ("per_page", "-5"),
        ("per_page", "x"),
        ("per_page", "9" * 5000),
    ],
)
def test_invalid_parameter_is_reported_by_name(client, name, value):
    details = _details(client, **{name: value})

    assert list(details) == [name]
    assert len(details[name]) == 1
    assert not any(word in details[name][0] for word in ("Input", "should", "Value error"))


def test_applied_from_after_applied_to_is_rejected(client):
    details = _details(client, applied_from="2026-09-02", applied_to="2026-09-01")

    assert details == {
        "applied_from": ["La fecha inicial no puede ser posterior a la fecha final."]
    }


def test_all_invalid_parameters_are_reported_together(client):
    details = _details(client, status="x", page="0", per_page="0")

    assert set(details) == {"status", "page", "per_page"}
