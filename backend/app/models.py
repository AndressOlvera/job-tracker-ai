from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Identity,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db

APPLICATION_STATUSES = ("applied", "interview", "offer", "rejected")

_STATUS_LIST = ", ".join(f"'{status}'" for status in APPLICATION_STATUSES)


class Application(db.Model):
    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUS_LIST})", name="ck_applications_status"),
        CheckConstraint("length(trim(company)) > 0", name="ck_applications_company_not_blank"),
        CheckConstraint("length(trim(position)) > 0", name="ck_applications_position_not_blank"),
        Index("ix_applications_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(always=False), primary_key=True)
    company: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'applied'")
    )
    applied_on: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    job_url: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


# Va fuera de la clase porque el orden descendente necesita la columna ya mapeada.
Index("ix_applications_applied_on", Application.applied_on.desc())
