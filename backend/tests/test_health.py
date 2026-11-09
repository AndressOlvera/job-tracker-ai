import pytest

from app import create_app


def test_health_ok_against_real_database(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "database": "ok"}


def test_health_degraded_when_database_is_unreachable(monkeypatch: pytest.MonkeyPatch):
    # El puerto 1 rechaza la conexión: se prueba el fallo real, sin simularlo.
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://x:x@127.0.0.1:1/x")

    response = create_app("testing").test_client().get("/api/v1/health")

    assert response.status_code == 503
    assert response.get_json() == {"status": "degraded", "database": "unreachable"}
