import re
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    field_serializer,
    model_validator,
)
from pydantic_core import PydanticCustomError

from app import clock
from app.models import APPLICATION_STATUSES

# Toda regla de campo se escribe aquí con su mensaje en español. Los validadores corren
# antes de Pydantic para que no haya coerción de tipos ni textos en inglés.
REQUIRED_MESSAGE = "Este campo es obligatorio."
_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def _invalid(message: str) -> PydanticCustomError:
    return PydanticCustomError("invalid", message)


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        raise _invalid("Debe ser texto.")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise _invalid("Contiene caracteres no válidos.") from None
    # PostgreSQL no admite el carácter NUL en columnas de texto.
    if "\x00" in value:
        raise _invalid("Contiene caracteres no válidos.")
    return value.strip()


def _check_length(value: str, max_length: int) -> str:
    if len(value) > max_length:
        raise _invalid(f"Debe tener como máximo {max_length} caracteres.")
    return value


def _required_text(max_length: int) -> Callable[[Any], str]:
    def validate(value: Any) -> str:
        if value is None:
            raise _invalid(REQUIRED_MESSAGE)
        cleaned = _clean_text(value)
        if not cleaned:
            raise _invalid(REQUIRED_MESSAGE)
        return _check_length(cleaned, max_length)

    return validate


def _optional_text(max_length: int) -> Callable[[Any], str | None]:
    def validate(value: Any) -> str | None:
        if value is None:
            return None
        cleaned = _clean_text(value)
        return _check_length(cleaned, max_length) if cleaned else None

    return validate


def _is_valid_host(host: str | None) -> bool:
    if not host:
        return False
    if ":" in host:  # IPv6: urlsplit ya revisó los corchetes
        return True
    # Se tolera un solo punto final, que es válido en DNS (example.com.).
    return all(host.removesuffix(".").split("."))


def _is_http_url(value: str) -> bool:
    if any(char.isspace() or not char.isprintable() for char in value):
        return False
    try:
        parts = urlsplit(value)
        _ = parts.port  # lanza ValueError si el puerto es inválido
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and _is_valid_host(parts.hostname)


def _job_url(value: Any) -> str | None:
    cleaned = _optional_text(500)(value)
    if cleaned is not None and not _is_http_url(cleaned):
        raise _invalid("Debe ser una URL válida que empiece con http:// o https://.")
    return cleaned


def _status(value: Any) -> str:
    if not isinstance(value, str) or value not in APPLICATION_STATUSES:
        raise _invalid("El estado no es válido.")
    return value


def _applied_on(value: Any) -> date:
    invalid_format = _invalid("Debe ser una fecha válida con formato AAAA-MM-DD.")
    # fromisoformat también aceptaría formatos como 20260101 o 2026-W01-1.
    if not isinstance(value, str) or not _DATE_PATTERN.fullmatch(value):
        raise invalid_format
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise invalid_format from None
    if parsed > clock.today():
        raise _invalid("La fecha no puede ser futura.")
    return parsed


Name = Annotated[str, BeforeValidator(_required_text(120))]
Status = Annotated[str, BeforeValidator(_status)]
AppliedOn = Annotated[date, BeforeValidator(_applied_on)]
JobUrl = Annotated[str | None, BeforeValidator(_job_url)]
Source = Annotated[str | None, BeforeValidator(_optional_text(60))]
Notes = Annotated[str | None, BeforeValidator(_optional_text(5000))]


class _ApplicationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ApplicationCreate(_ApplicationInput):
    company: Name
    position: Name
    status: Status = "applied"
    # Nunca el default de la base: ese usa la zona de PostgreSQL (ADR-009).
    applied_on: AppliedOn = Field(default_factory=lambda: clock.today())
    job_url: JobUrl = None
    source: Source = None
    notes: Notes = None


class ApplicationUpdate(_ApplicationInput):
    # Los valores por defecto no se validan ni se aplican: el servicio usa solo lo enviado.
    company: Name = Field(default=None)
    position: Name = Field(default=None)
    status: Status = Field(default=None)
    applied_on: AppliedOn = Field(default=None)
    job_url: JobUrl = None
    source: Source = None
    notes: Notes = None

    @model_validator(mode="after")
    def _require_some_field(self) -> "ApplicationUpdate":
        if not self.model_fields_set:
            raise _invalid("Envía al menos un campo para modificar.")
        return self


class ApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: str
    position: str
    status: str
    applied_on: date
    job_url: str | None
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _serialize_timestamp(self, value: datetime) -> str:
        # Con microsegundos para que dos cambios en el mismo segundo se distingan.
        return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
