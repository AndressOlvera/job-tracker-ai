from flask import Blueprint, Response, jsonify, url_for
from werkzeug.routing import BaseConverter

from app.models import Application
from app.schemas import ApplicationCreate, ApplicationResponse, ApplicationUpdate
from app.services import applications as service
from app.validation import parse_json_body

applications_bp = Blueprint("applications", __name__)

ID_ROUTE = "/applications/<application_id:application_id>"


class ApplicationIdConverter(BaseConverter):
    # La regex limita los dígitos porque si la conversión falla, Werkzeug responde 405 y no 404.
    regex = r"[0-9]{1,10}"

    def to_python(self, value: str) -> int:
        return int(value)

    def to_url(self, value: int) -> str:
        return str(value)


def _serialize(application: Application) -> Response:
    body = ApplicationResponse.model_validate(application).model_dump(mode="json")
    return jsonify(body)


@applications_bp.post("/applications")
def create_application() -> tuple[Response, int, dict[str, str]]:
    data = parse_json_body(ApplicationCreate)
    application = service.create_application(data.model_dump())
    location = url_for(".get_application", application_id=application.id)
    return _serialize(application), 201, {"Location": location}


@applications_bp.get(ID_ROUTE)
def get_application(application_id: int) -> Response:
    return _serialize(service.get_application(application_id))


@applications_bp.patch(ID_ROUTE)
def update_application(application_id: int) -> Response:
    data = parse_json_body(ApplicationUpdate)
    fields = data.model_dump(exclude_unset=True)
    return _serialize(service.update_application(application_id, fields))


@applications_bp.delete(ID_ROUTE)
def delete_application(application_id: int) -> tuple[str, int]:
    service.delete_application(application_id)
    return "", 204
