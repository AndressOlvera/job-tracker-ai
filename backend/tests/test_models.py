from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import APPLICATION_STATUSES, Application


@pytest.fixture
def session(app):
    with app.app_context():
        yield db.session
        db.session.rollback()


def _application(**overrides) -> Application:
    return Application(**{"company": "Oracle", "position": "Becario", **overrides})


def test_database_assigns_defaults(session):
    application = _application()
    session.add(application)
    session.commit()

    assert application.id == 1  # el vaciado también reinicia la secuencia
    assert application.status == "applied"
    assert isinstance(application.applied_on, date)
    assert application.created_at.tzinfo is not None
    assert application.updated_at == application.created_at
    assert application.job_url is None


def test_update_refreshes_updated_at(session):
    application = _application()
    session.add(application)
    session.commit()
    created_at = application.created_at

    application.status = "offer"
    session.commit()

    assert application.created_at == created_at
    assert application.updated_at > created_at


@pytest.mark.parametrize("status", APPLICATION_STATUSES)
def test_valid_statuses_are_accepted(session, status):
    session.add(_application(status=status))
    session.commit()


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"status": "ghosted"}, "ck_applications_status"),
        ({"company": "   "}, "ck_applications_company_not_blank"),
        ({"position": ""}, "ck_applications_position_not_blank"),
    ],
)
def test_invalid_rows_are_rejected_by_database(session, overrides, constraint):
    session.add(_application(**overrides))

    with pytest.raises(IntegrityError, match=constraint):
        session.commit()
