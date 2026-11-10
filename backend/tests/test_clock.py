from datetime import UTC, date, datetime

import pytest

from app import clock


class _FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 1, 1, 3, 0, tzinfo=UTC).astimezone(tz)


def test_today_uses_app_timezone_instead_of_utc(app, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(clock, "datetime", _FixedDatetime)

    with app.app_context():
        assert clock.today() == date(2025, 12, 31)
