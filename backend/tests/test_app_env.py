import pytest

from app import create_app
from app.config import ConfigError

DEV_URL = "postgresql+psycopg://u:p@db/dev"
TEST_URL = "postgresql+psycopg://u:p@db/test"
PROD_URL = "postgresql+psycopg://u:p@db/prod"


@pytest.mark.parametrize(
    ("app_env", "database_url", "test_database_url", "expected_uri", "testing"),
    [
        ("development", DEV_URL, TEST_URL, DEV_URL, False),
        ("testing", PROD_URL, TEST_URL, TEST_URL, True),
        ("production", PROD_URL, TEST_URL, PROD_URL, False),
    ],
)
def test_create_app_selects_config_from_app_env(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
    database_url: str,
    test_database_url: str,
    expected_uri: str,
    testing: bool,
):
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TEST_DATABASE_URL", test_database_url)

    app = create_app()

    assert app.config["APP_ENV"] == app_env
    assert app.config["SQLALCHEMY_DATABASE_URI"] == expected_uri
    assert app.config["TESTING"] is testing


def test_explicit_environment_wins_over_app_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    assert create_app("testing").config["APP_ENV"] == "testing"


def test_invalid_app_env_is_rejected_by_create_app(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "staging")

    with pytest.raises(ConfigError, match="APP_ENV inválido: 'staging'"):
        create_app()


@pytest.mark.parametrize("app_env", ["production", ""])
@pytest.mark.parametrize("database_url", [None, ""])
def test_production_without_database_url_fails_clearly(
    monkeypatch: pytest.MonkeyPatch, app_env: str, database_url: str | None
):
    monkeypatch.setenv("APP_ENV", app_env)
    if database_url is None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    else:
        monkeypatch.setenv("DATABASE_URL", database_url)

    with pytest.raises(ConfigError, match="Falta la variable de entorno DATABASE_URL"):
        create_app()


def test_engine_options_protect_health_from_hanging():
    options = create_app("testing").config["SQLALCHEMY_ENGINE_OPTIONS"]

    assert options["pool_pre_ping"] is True
    assert options["connect_args"]["connect_timeout"] == 3
