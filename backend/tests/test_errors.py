from flask import abort, request


def _error(response):
    return response.get_json()["error"]


def test_unknown_route_returns_404(client):
    response = client.get("/api/v1/no-existe")

    assert response.status_code == 404
    assert _error(response) == {"code": "not_found", "message": "El recurso solicitado no existe."}


def test_wrong_method_returns_405_with_allow_header(client):
    response = client.post("/api/v1/health")

    assert response.status_code == 405
    assert _error(response)["code"] == "method_not_allowed"
    assert "GET" in response.headers["Allow"]


def test_invalid_json_returns_400(app):
    app.add_url_rule("/echo", "echo", lambda: request.get_json(), methods=["POST"])

    response = app.test_client().post("/echo", data="{no es json", content_type="application/json")

    assert response.status_code == 400
    assert _error(response)["code"] == "bad_request"


def test_missing_json_content_type_returns_415(app):
    app.add_url_rule("/echo", "echo", lambda: request.get_json(), methods=["POST"])

    response = app.test_client().post("/echo", data="{}", content_type="text/plain")

    assert response.status_code == 415
    assert _error(response)["code"] == "unsupported_media_type"


def test_unexpected_error_returns_500_without_details(app):
    def explode():
        raise RuntimeError("detalle-interno")

    app.add_url_rule("/explode", "explode", explode)
    app.config["PROPAGATE_EXCEPTIONS"] = False  # TESTING las propagaría al cliente de pruebas

    response = app.test_client().get("/explode")

    assert response.status_code == 500
    assert _error(response) == {"code": "internal_error", "message": "Ocurrió un error inesperado."}
    assert "detalle-interno" not in response.get_data(as_text=True)


def test_unmapped_client_error_keeps_format_and_status(app):
    app.add_url_rule("/teapot", "teapot", lambda: abort(418))

    response = app.test_client().get("/teapot")

    assert response.status_code == 418
    assert _error(response)["code"] == "bad_request"
