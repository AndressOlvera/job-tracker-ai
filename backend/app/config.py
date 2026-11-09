import os
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "America/Mexico_City"

# Credenciales solo del contenedor local; producción no tiene valor por defecto.
LOCAL_DATABASE_URL = "postgresql+psycopg://jobtracker:jobtracker@localhost:5432/jobtracker"
LOCAL_TEST_DATABASE_URL = f"{LOCAL_DATABASE_URL}_test"


class ConfigError(RuntimeError):
    """La configuración del entorno está incompleta o es inválida."""


def _database_uri(env_name: str) -> str:
    match env_name:
        case "development":
            return os.environ.get("DATABASE_URL") or LOCAL_DATABASE_URL
        case "testing":
            # Nunca DATABASE_URL: las pruebas vacían las tablas (ADR-010).
            return os.environ.get("TEST_DATABASE_URL") or LOCAL_TEST_DATABASE_URL
        case "production":
            uri = os.environ.get("DATABASE_URL")
            if not uri:
                raise ConfigError("Falta la variable de entorno DATABASE_URL en producción.")
            return uri
        case _:
            raise ConfigError(
                f"APP_ENV inválido: {env_name!r}. Usa development, testing o production."
            )


def _timezone() -> str:
    name = os.environ.get("APP_TIMEZONE") or DEFAULT_TIMEZONE
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ConfigError(f"APP_TIMEZONE inválida: {name!r}.") from exc
    return name


def load_config(env_name: str | None = None) -> dict[str, Any]:
    # Sin APP_ENV se asume producción, para que un olvido no active valores locales.
    env = env_name or os.environ.get("APP_ENV") or "production"
    return {
        "APP_ENV": env,
        "TESTING": env == "testing",
        "APP_TIMEZONE": _timezone(),
        "SQLALCHEMY_DATABASE_URI": _database_uri(env),
        # pre_ping recupera la conexión tras reiniciar la base; el timeout evita colgar /health.
        "SQLALCHEMY_ENGINE_OPTIONS": {
            "pool_pre_ping": True,
            "connect_args": {"connect_timeout": 3},
        },
    }
