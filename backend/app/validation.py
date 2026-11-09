from flask import request
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError
from werkzeug.exceptions import BadRequest

BODY_KEY = "body"
_BUILT_IN_MESSAGES = {
    "missing": "Este campo es obligatorio.",
    "extra_forbidden": "Este campo no está permitido.",
}
_FALLBACK_MESSAGE = "El valor no es válido."


class RequestValidationError(Exception):
    def __init__(self, details: dict[str, list[str]]) -> None:
        super().__init__("validation_error")
        self.details = details


def _to_details(error: PydanticValidationError) -> dict[str, list[str]]:
    details: dict[str, list[str]] = {}
    for item in error.errors(include_url=False, include_context=False, include_input=False):
        field = str(item["loc"][0]) if item["loc"] else BODY_KEY
        if item["type"] == "invalid":
            message = item["msg"]
        else:
            message = _BUILT_IN_MESSAGES.get(item["type"], _FALLBACK_MESSAGE)
        details.setdefault(field, []).append(message)
    return details


def parse_json_body[Schema: BaseModel](schema: type[Schema]) -> Schema:
    """Valida el cuerpo JSON; Flask responde 415 sin Content-Type JSON y 400 si no se puede leer."""
    try:
        payload = request.get_json()
    except RecursionError:
        # JSON anidado en exceso: el parser no lo convierte en ValueError.
        raise BadRequest() from None
    if not isinstance(payload, dict):
        raise RequestValidationError({BODY_KEY: ["El cuerpo debe ser un objeto JSON."]})
    try:
        return schema.model_validate(payload)
    except PydanticValidationError as error:
        raise RequestValidationError(_to_details(error)) from None
