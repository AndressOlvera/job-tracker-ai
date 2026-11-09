from flask import Blueprint, Response, jsonify

from app.services.stats import get_stats

stats_bp = Blueprint("stats", __name__)


@stats_bp.get("/stats")
def stats() -> Response:
    return jsonify(get_stats())
