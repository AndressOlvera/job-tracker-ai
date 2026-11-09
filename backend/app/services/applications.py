from typing import Any

from flask import abort

from app.extensions import db
from app.models import Application

# Límite de la columna INTEGER: más allá PostgreSQL daría error en lugar de "no existe".
MAX_ID = 2_147_483_647


def create_application(fields: dict[str, Any]) -> Application:
    application = Application(**fields)
    db.session.add(application)
    db.session.commit()
    return application


def get_application(application_id: int) -> Application:
    if application_id > MAX_ID:
        abort(404)
    return db.get_or_404(Application, application_id)


def update_application(application_id: int, fields: dict[str, Any]) -> Application:
    application = get_application(application_id)
    for name, value in fields.items():
        setattr(application, name, value)
    db.session.commit()
    return application


def delete_application(application_id: int) -> None:
    db.session.delete(get_application(application_id))
    db.session.commit()
