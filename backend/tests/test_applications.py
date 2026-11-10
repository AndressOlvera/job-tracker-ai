from datetime import date

import pytest

from app import clock
from app.extensions import db
from app.models import Application

BASE = "/api/v1/applications"
TODAY = date(2026, 10, 3)
VALID = {"company": "Oracle", "position": "Becario"}
MAX_INTEGER = 2147483647


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "today", lambda: TODAY)


def _create(client, **overrides):
    response = client.post(BASE, json={**VALID, **overrides})
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()


def _details(response):
    assert response.status_code == 422
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    assert error["message"] == "Algunos campos no son válidos."
    return error["details"]


# ---------- POST ----------


def test_create_applies_defaults_and_location(client):
    response = client.post(BASE, json=VALID)

    assert response.status_code == 201
    body = response.get_json()
    assert response.headers["Location"] == f"{BASE}/{body['id']}"
    assert body["status"] == "applied"
    assert body["applied_on"] == "2026-10-03"
    assert body["job_url"] is None and body["source"] is None and body["notes"] is None
    assert set(body) == {
        "id",
        "company",
        "position",
        "status",
        "applied_on",
        "job_url",
        "source",
        "notes",
        "created_at",
        "updated_at",
    }


def test_timestamps_are_iso_8601_in_utc(client):
    body = _create(client)

    assert body["created_at"].endswith("Z")
    assert date.fromisoformat(body["created_at"][:10])


def test_create_stores_all_fields(client):
    body = _create(
        client,
        status="interview",
        applied_on="2026-09-28",
        job_url="https://www.occ.com.mx/empleo/oferta/12345",
        source="OCC",
        notes="Entrevista el viernes",
    )

    assert body["status"] == "interview"
    assert body["applied_on"] == "2026-09-28"
    assert body["job_url"] == "https://www.occ.com.mx/empleo/oferta/12345"
    assert body["source"] == "OCC"
    assert body["notes"] == "Entrevista el viernes"


def test_create_trims_names(client):
    body = _create(client, company="  Oracle  ", position="\tBecario\n")

    assert body["company"] == "Oracle"
    assert body["position"] == "Becario"


@pytest.mark.parametrize("empty", ["", "   ", None])
@pytest.mark.parametrize("field", ["job_url", "source", "notes"])
def test_blank_optional_is_stored_as_null(client, field, empty):
    assert _create(client, **{field: empty})[field] is None


def test_today_is_accepted_and_tomorrow_rejected(client):
    assert _create(client, applied_on="2026-10-03")["applied_on"] == "2026-10-03"

    response = client.post(BASE, json={**VALID, "applied_on": "2026-10-04"})

    assert _details(response) == {"applied_on": ["La fecha no puede ser futura."]}


def test_missing_required_fields(client):
    assert _details(client.post(BASE, json={})) == {
        "company": ["Este campo es obligatorio."],
        "position": ["Este campo es obligatorio."],
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("company", 123),
        ("company", True),
        ("company", None),
        ("company", ""),
        ("company", "   "),
        ("company", "x" * 121),
        ("company", "con\x00nul"),
        ("company", "\ud800"),
        ("position", 1.5),
        ("position", ["a"]),
        ("position", "   "),
        ("position", "x" * 121),
        ("status", "ghosted"),
        ("status", 1),
        ("status", None),
        ("status", ["applied"]),
        ("status", "APPLIED"),
        ("applied_on", None),
        ("applied_on", ""),
        ("applied_on", 20260101),
        ("applied_on", "2026-02-30"),
        ("applied_on", "20260101"),
        ("applied_on", "2026-W01-1"),
        ("applied_on", "2026-01-01T00:00:00"),
        ("applied_on", "2026-01-01\n"),
        ("job_url", 5),
        ("job_url", "ftp://example.com"),
        ("job_url", "javascript:alert(1)"),
        ("job_url", "example.com"),
        ("job_url", "https://"),
        ("job_url", "http://:80"),
        ("job_url", "https://exa mple.com"),
        ("job_url", "https://[bad"),
        ("job_url", "https://example.com:99999"),
        ("job_url", "https://example.com/" + "x" * 481),
        ("source", 5),
        ("source", "x" * 61),
        ("notes", {}),
        ("notes", "x" * 5001),
    ],
)
def test_invalid_field_is_reported_with_spanish_message(client, field, value):
    details = _details(client.post(BASE, json={**VALID, field: value}))

    assert list(details) == [field]
    assert len(details[field]) == 1
    assert not any(word in details[field][0] for word in ("Input", "should", "Value error"))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("company", "x" * 120),
        ("position", "x" * 120),
        ("job_url", "https://example.com/" + "x" * 480),
        ("source", "x" * 60),
        ("notes", "x" * 5000),
        ("job_url", "HTTP://example.com:8080/a?b=c#d"),
    ],
)
def test_boundary_values_are_accepted(client, field, value):
    assert _create(client, **{field: value})[field] == value


@pytest.mark.parametrize("field", ["id", "created_at", "updated_at", "unknown", "body"])
def test_server_and_unknown_fields_are_rejected(client, field):
    details = _details(client.post(BASE, json={**VALID, field: 1}))

    assert details == {field: ["Este campo no está permitido."]}


@pytest.mark.parametrize("payload", ["[]", '"texto"', "1", "null", "true"])
@pytest.mark.parametrize("method", ["post", "patch"])
def test_non_object_json_is_reported_under_body(client, method, payload):
    url = BASE if method == "post" else f"{BASE}/{_create(client)['id']}"

    response = getattr(client, method)(url, data=payload, content_type="application/json")

    assert _details(response) == {"body": ["El cuerpo debe ser un objeto JSON."]}


@pytest.mark.parametrize("method", ["post", "patch"])
@pytest.mark.parametrize("headers", [{"content_type": "text/plain"}, {}])
def test_missing_json_content_type_returns_415(client, method, headers):
    url = BASE if method == "post" else f"{BASE}/{_create(client)['id']}"

    response = getattr(client, method)(url, data="{}", **headers)

    assert response.status_code == 415
    assert response.get_json()["error"]["code"] == "unsupported_media_type"


@pytest.mark.parametrize("payload", ["{mal", "", "[" * 200_000, b"\xff"])
@pytest.mark.parametrize("method", ["post", "patch"])
def test_malformed_json_returns_400(client, method, payload):
    url = BASE if method == "post" else f"{BASE}/{_create(client)['id']}"

    response = getattr(client, method)(url, data=payload, content_type="application/json")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "bad_request"


@pytest.mark.parametrize(
    "url",
    ["http://.", "http://..", "http://a..b", "https://.example.com", "https://example.com.."],
)
def test_job_url_with_empty_host_labels_is_rejected(client, url):
    details = _details(client.post(BASE, json={**VALID, "job_url": url}))

    assert list(details) == ["job_url"]


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:5000/a",
        "http://127.0.0.1/",
        "http://[::1]:8080/",
        "https://www.occ.com.mx/empleo",
        "http://example.com.",
    ],
)
def test_job_url_with_valid_host_is_accepted(client, url):
    assert _create(client, job_url=url)["job_url"] == url


# ---------- GET ----------


def test_get_returns_application(client):
    created = _create(client)

    response = client.get(f"{BASE}/{created['id']}")

    assert response.status_code == 200
    assert response.get_json() == created


# ---------- PATCH ----------


def test_patch_changes_only_sent_fields_and_updated_at(client):
    created = _create(client, source="OCC", notes="nota")

    response = client.patch(f"{BASE}/{created['id']}", json={"status": "offer", "notes": None})

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "offer"
    assert body["notes"] is None
    assert body["updated_at"] != created["updated_at"]
    unchanged = {k: v for k, v in body.items() if k not in ("status", "notes", "updated_at")}
    assert unchanged == {k: created[k] for k in unchanged}


def test_patch_does_not_reset_applied_on_to_today(client):
    created = _create(client, applied_on="2026-01-15")

    body = client.patch(f"{BASE}/{created['id']}", json={"source": "OCC"}).get_json()

    assert body["applied_on"] == "2026-01-15"


def test_patch_trims_and_blanks_optional(client):
    created = _create(client, source="OCC")

    body = client.patch(
        f"{BASE}/{created['id']}", json={"company": "  IBM ", "source": "  "}
    ).get_json()

    assert body["company"] == "IBM"
    assert body["source"] is None


@pytest.mark.parametrize("field", ["company", "position", "status", "applied_on"])
def test_patch_rejects_null_for_non_nullable(client, field):
    created = _create(client)

    details = _details(client.patch(f"{BASE}/{created['id']}", json={field: None}))

    assert list(details) == [field]


@pytest.mark.parametrize("field", ["job_url", "source", "notes"])
def test_patch_accepts_null_for_optional(client, field):
    created = _create(client, job_url="https://a.com", source="OCC", notes="n")

    body = client.patch(f"{BASE}/{created['id']}", json={field: None}).get_json()

    assert body[field] is None


def test_patch_empty_body_is_reported_under_body(client):
    created = _create(client)

    details = _details(client.patch(f"{BASE}/{created['id']}", json={}))

    assert details == {"body": ["Envía al menos un campo para modificar."]}


@pytest.mark.parametrize(
    "payload",
    [
        {"applied_on": "2026-10-04"},
        {"company": "   "},
        {"status": "x"},
        {"job_url": "ftp://x.com"},
        {"id": 9},
        {"created_at": "2026-01-01"},
        {"updated_at": "2026-01-01"},
        {"otro": 1},
    ],
)
def test_patch_applies_same_rules_as_create(client, payload):
    created = _create(client)

    details = _details(client.patch(f"{BASE}/{created['id']}", json=payload))

    assert list(details) == list(payload)
    assert client.get(f"{BASE}/{created['id']}").get_json() == created


# ---------- DELETE ----------


def test_delete_removes_the_row(client, app):
    created = _create(client)

    response = client.delete(f"{BASE}/{created['id']}")

    assert response.status_code == 204
    assert response.get_data() == b""
    with app.app_context():
        assert db.session.get(Application, created["id"]) is None
    assert client.get(f"{BASE}/{created['id']}").status_code == 404


# ---------- 404 ----------


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
@pytest.mark.parametrize(
    "application_id", ["999", "0", "-1", "abc", str(MAX_INTEGER + 1), "9" * 40, "9" * 5000]
)
def test_missing_or_out_of_range_id_returns_404(client, method, application_id):
    kwargs = {"json": {"status": "offer"}} if method == "patch" else {}

    response = getattr(client, method)(f"{BASE}/{application_id}", **kwargs)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_largest_integer_id_does_not_fail(client):
    assert client.get(f"{BASE}/{MAX_INTEGER}").status_code == 404
