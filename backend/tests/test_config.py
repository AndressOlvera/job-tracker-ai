import pytest

from app import create_app
from app.config import LOCAL_TEST_DATABASE_URL, ConfigError, load_config


def test_production_requires_database_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ConfigError, match="DATABASE_URL"):
        create_app("production")


def test_production_uses_database_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db/prod")

    config = load_config("production")

    assert config["SQLALCHEMY_DATABASE_URI"] == "postgresql+psycopg://u:p@db/prod"
    assert config["TESTING"] is False


def test_missing_app_env_defaults_to_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db/prod")

    assert load_config()["APP_ENV"] == "production"


def test_development_uses_database_url_or_local_default(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert load_config("development")["SQLALCHEMY_DATABASE_URI"].endswith("/jobtracker")

    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db/dev")
    assert load_config("development")["SQLALCHEMY_DATABASE_URI"].endswith("/dev")


def test_testing_never_uses_database_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db/prod")
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)

    assert load_config("testing")["SQLALCHEMY_DATABASE_URI"] == LOCAL_TEST_DATABASE_URL


def test_unknown_environment_is_rejected():
    with pytest.raises(ConfigError, match="APP_ENV"):
        load_config("staging")


def test_invalid_timezone_is_rejected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_TIMEZONE", "Marte/Olympus")

    with pytest.raises(ConfigError, match="APP_TIMEZONE"):
        load_config("testing")
