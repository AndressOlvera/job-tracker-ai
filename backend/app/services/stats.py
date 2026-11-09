from typing import Any

from sqlalchemy import func, select

from app.extensions import db
from app.models import APPLICATION_STATUSES, Application


def _rate(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0


def _counts_by_status() -> dict[str, int]:
    query = select(Application.status, func.count()).group_by(Application.status)
    found = {status: count for status, count in db.session.execute(query)}
    return {status: found.get(status, 0) for status in APPLICATION_STATUSES}


def _counts_by_month() -> list[dict[str, Any]]:
    month = func.to_char(Application.applied_on, "YYYY-MM").label("month")
    # Se agrupa por la etiqueta: repetir la expresión crearía parámetros distintos para PostgreSQL.
    query = select(month, func.count()).group_by("month").order_by("month")
    return [{"month": label, "count": count} for label, count in db.session.execute(query)]


def get_stats() -> dict[str, Any]:
    by_status = _counts_by_status()
    total = sum(by_status.values())
    interviewed = by_status["interview"] + by_status["offer"]
    return {
        "total": total,
        "by_status": by_status,
        "response_rate": _rate(interviewed + by_status["rejected"], total),
        "interview_rate": _rate(interviewed, total),
        "by_month": _counts_by_month(),
    }
