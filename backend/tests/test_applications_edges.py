"""Huecos de test_applications.py. Aquí el reloj es real: esas pruebas reemplazan clock.today."""

import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app import create_app

BASE = "/api/v1/applications"
VALID = {"company": "Oracle", "position": "Becario"}
# UTC+14 y UTC-11: 25 horas de diferencia, así que nunca coinciden en la fecha.
AHEAD = "Pacific/Kiritimati"
BEHIND = "Pacific/Pago_Pago"


def _client_in_zone(monkeypatch: pytest.MonkeyPatch, zone: str):
    monkeypatch.setenv("APP_TIMEZONE", zone)
    return create_app("testing").test_client()


def _today_in(zone: str) -> str:
    return datetime.now(ZoneInfo(zone)).date().isoformat()


@pytest.mark.parametrize("zone", [AHEAD, BEHIND])
def test_default_applied_on_uses_app_timezone(monkeypatch: pytest.MonkeyPatch, zone: str):
    client = _client_in_zone(monkeypatch, zone)

    before = _today_in(zone)
    body = client.post(BASE, json=VALID).get_json()
    after = _today_in(zone)

    assert body["applied_on"] in {before, after}


def test_today_in_app_timezone_is_accepted_even_if_ahead_of_utc(monkeypatch: pytest.MonkeyPatch):
    client = _client_in_zone(monkeypatch, AHEAD)

    response = client.post(BASE, json={**VALID, "applied_on": _today_in(AHEAD)})

    assert response.status_code == 201


def test_date_ahead_of_app_timezone_is_future_even_if_past_elsewhere(
    monkeypatch: pytest.MonkeyPatch,
):
    client = _client_in_zone(monkeypatch, BEHIND)
    tomorrow = datetime.now(ZoneInfo(BEHIND)).date() + timedelta(days=1)

    response = client.post(BASE, json={**VALID, "applied_on": tomorrow.isoformat()})

    assert response.status_code == 422
    assert response.get_json()["error"]["details"] == {
        "applied_on": ["La fecha no puede ser futura."]
    }


def test_all_invalid_fields_are_reported_together(client):
    payload = {"company": "", "status": "x", "applied_on": "2999-01-01", "extra": 1}

    response = client.post(BASE, json=payload)

    assert response.status_code == 422
    details = response.get_json()["error"]["details"]
    assert set(details) == {"company", "position", "status", "applied_on", "extra"}


@pytest.mark.parametrize(
    ("sent", "stored"),
    [
        ("😀" * 120, "😀" * 120),  # el límite son caracteres, no bytes
        ("  " + "x" * 120 + "  ", "x" * 120),  # el recorte ocurre antes de medir
    ],
)
def test_company_length_boundary_round_trips(client, sent: str, stored: str):
    created = client.post(BASE, json={**VALID, "company": sent})

    assert created.status_code == 201
    assert client.get(created.headers["Location"]).get_json()["company"] == stored


def test_json_content_type_with_charset_is_accepted(client):
    response = client.post(
        BASE,
        data=json.dumps({"company": "Ñandú", "position": "Niño"}),
        content_type="application/json; charset=utf-8",
    )

    assert response.status_code == 201
    assert response.get_json()["company"] == "Ñandú"


@pytest.mark.parametrize("method", ["put", "post"])
def test_wrong_method_on_item_returns_405_with_allow(client, method: str):
    created = client.post(BASE, json=VALID).get_json()

    response = getattr(client, method)(f"{BASE}/{created['id']}", json=VALID)

    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "method_not_allowed"
    assert {"GET", "PATCH", "DELETE"} <= set(response.headers["Allow"].split(", "))


def test_delete_only_removes_the_requested_row(client):
    kept = client.post(BASE, json=VALID).get_json()
    removed = client.post(BASE, json=VALID).get_json()

    assert client.delete(f"{BASE}/{removed['id']}").status_code == 204

    assert client.get(f"{BASE}/{kept['id']}").get_json() == kept


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("post", BASE, {"json": VALID}),
        ("get", f"{BASE}/1", {}),
        ("patch", f"{BASE}/1", {"json": {"status": "offer"}}),
        ("delete", f"{BASE}/1", {}),
    ],
)
def test_database_failure_returns_500_without_details(
    monkeypatch: pytest.MonkeyPatch, method: str, path: str, kwargs: dict
):
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://x:clave-secreta@127.0.0.1:1/x")
    app = create_app("testing")
    app.config["PROPAGATE_EXCEPTIONS"] = False  # TESTING las propagaría al cliente de pruebas

    response = getattr(app.test_client(), method)(path, **kwargs)

    assert response.status_code == 500
    assert response.get_json() == {
        "error": {"code": "internal_error", "message": "Ocurrió un error inesperado."}
    }
    assert "clave-secreta" not in response.get_data(as_text=True)
