import pytest
from flask import Flask, abort, request

from app import create_app

ERROR_CASES = [
    ("get", "/api/v1/no-existe", {}, 404, "not_found"),
    ("get", "/", {}, 404, "not_found"),
    ("get", "/api/v1/health/", {}, 404, "not_found"),
    ("delete", "/api/v1/health", {}, 405, "method_not_allowed"),
    ("post", "/echo", {"data": "{mal", "content_type": "application/json"}, 400, "bad_request"),
    ("post", "/echo", {"data": "", "content_type": "application/json"}, 400, "bad_request"),
    ("post", "/echo", {"data": "{}"}, 415, "unsupported_media_type"),
    (
        "post",
        "/echo",
        {"data": "<a/>", "content_type": "application/xml"},
        415,
        "unsupported_media_type",
    ),
]


def _with_echo(app: Flask) -> Flask:
    app.add_url_rule("/echo", "echo", lambda: request.get_json(), methods=["POST"])
    return app


def _assert_error_shape(response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.mimetype == "application/json"
    body = response.get_json()
    # `details` es exclusivo de 422, según docs/03-api.md.
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    assert body["error"]["message"]


@pytest.mark.parametrize(("method", "path", "kwargs", "status", "code"), ERROR_CASES)
def test_error_format(app: Flask, method: str, path: str, kwargs: dict, status: int, code: str):
    response = getattr(_with_echo(app).test_client(), method)(path, **kwargs)

    _assert_error_shape(response, status, code)


def test_500_in_production_config_hides_internals(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:clave-secreta@127.0.0.1:1/x")
    app = create_app("production")

    def explode():
        raise RuntimeError("detalle-interno")

    app.add_url_rule("/explode", "explode", explode)

    response = app.test_client().get("/explode")

    _assert_error_shape(response, 500, "internal_error")
    text = response.get_data(as_text=True)
    assert "detalle-interno" not in text
    assert "Traceback" not in text
    assert "clave-secreta" not in text


def test_abort_description_is_not_exposed(app: Flask):
    app.add_url_rule("/abort", "abort", lambda: abort(500, description="secreto-interno"))

    response = app.test_client().get("/abort")

    _assert_error_shape(response, 500, "internal_error")
    assert "secreto-interno" not in response.get_data(as_text=True)


def test_health_accepts_head(client):
    assert client.head("/api/v1/health").status_code == 200


def test_health_ok_is_json(client):
    assert client.get("/api/v1/health").mimetype == "application/json"


@pytest.mark.parametrize(
    "url",
    [
        # Servidor real, base inexistente.
        "postgresql+psycopg://jobtracker:jobtracker@127.0.0.1:5432/no_existe",
        # Servidor real, credenciales incorrectas.
        "postgresql+psycopg://jobtracker:clave-mala@127.0.0.1:5432/jobtracker",
    ],
)
def test_health_degraded_on_real_connection_failures(monkeypatch: pytest.MonkeyPatch, url: str):
    monkeypatch.setenv("TEST_DATABASE_URL", url)

    response = create_app("testing").test_client().get("/api/v1/health")

    assert response.status_code == 503
    assert response.get_json() == {"status": "degraded", "database": "unreachable"}
    assert "clave-mala" not in response.get_data(as_text=True)
