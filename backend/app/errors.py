from flask import Flask, Response, jsonify
from werkzeug.exceptions import HTTPException, MethodNotAllowed

ERRORS = {
    400: ("bad_request", "El cuerpo de la petición no es JSON válido."),
    404: ("not_found", "El recurso solicitado no existe."),
    405: ("method_not_allowed", "Método no permitido en esta ruta."),
    415: ("unsupported_media_type", "El Content-Type debe ser application/json."),
    500: ("internal_error", "Ocurrió un error inesperado."),
}


def _handle_http_exception(error: HTTPException) -> tuple[Response, int]:
    status = error.code or 500
    # Solo textos propios: la descripción de la excepción puede traer detalles internos.
    fallback = ERRORS[400 if status < 500 else 500]
    code, message = ERRORS.get(status, fallback)
    response = jsonify(error={"code": code, "message": message})
    if isinstance(error, MethodNotAllowed) and error.valid_methods:
        response.headers["Allow"] = ", ".join(error.valid_methods)
    return response, status


def register_error_handlers(app: Flask) -> None:
    # Flask registra en el log las excepciones no controladas y las entrega aquí como 500.
    app.register_error_handler(HTTPException, _handle_http_exception)
