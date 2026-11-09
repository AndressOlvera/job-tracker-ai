from flask import Blueprint, Response, jsonify

from app.services.health import database_is_reachable

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health() -> tuple[Response, int]:
    if database_is_reachable():
        return jsonify(status="ok", database="ok"), 200
    return jsonify(status="degraded", database="unreachable"), 503
