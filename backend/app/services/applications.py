from datetime import date
from math import ceil
from typing import Any

from flask import abort
from sqlalchemy import ColumnElement, func, or_, select

from app.extensions import db
from app.models import Application

# Límite de la columna INTEGER: más allá PostgreSQL daría error en lugar de "no existe".
MAX_ID = 2_147_483_647


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _filters(
    status: str | None, q: str | None, applied_from: date | None, applied_to: date | None
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if status is not None:
        conditions.append(Application.status == status)
    if q is not None:
        pattern = f"%{_escape_like(q)}%"
        conditions.append(
            or_(
                Application.company.ilike(pattern, escape="\\"),
                Application.position.ilike(pattern, escape="\\"),
            )
        )
    if applied_from is not None:
        conditions.append(Application.applied_on >= applied_from)
    if applied_to is not None:
        conditions.append(Application.applied_on <= applied_to)
    return conditions


def _order_by(sort: str) -> list[ColumnElement[Any]]:
    field = sort.removeprefix("-")
    column = func.lower(Application.company) if field == "company" else getattr(Application, field)
    if sort.startswith("-"):
        return [column.desc(), Application.id.desc()]
    return [column.asc(), Application.id.asc()]


def list_applications(
    *,
    status: str | None,
    q: str | None,
    applied_from: date | None,
    applied_to: date | None,
    sort: str,
    page: int,
    per_page: int,
) -> dict[str, Any]:
    conditions = _filters(status, q, applied_from, applied_to)
    total = db.session.scalar(select(func.count()).select_from(Application).where(*conditions))
    offset = (page - 1) * per_page
    items: list[Application] = []
    # Además de ahorrar la consulta, evita que una página enorme desborde el OFFSET.
    if offset < total:
        query = (
            select(Application)
            .where(*conditions)
            .order_by(*_order_by(sort))
            .limit(per_page)
            .offset(offset)
        )
        items = list(db.session.scalars(query))
    return {
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": ceil(total / per_page),
    }


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
