from datetime import date, datetime
from zoneinfo import ZoneInfo

from flask import current_app


def today() -> date:
    """Fecha de hoy según APP_TIMEZONE; el servidor corre en UTC (ADR-009)."""
    return datetime.now(ZoneInfo(current_app.config["APP_TIMEZONE"])).date()
