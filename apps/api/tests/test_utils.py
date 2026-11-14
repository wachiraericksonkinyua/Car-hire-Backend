import pytest

from app.utils.phone import normalize_kenyan_phone
from app.utils.time import utc_iso


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0712345678", "254712345678"),
        ("0112345678", "254112345678"),
        ("+254712345678", "254712345678"),
        ("254712345678", "254712345678"),
        ("0712 345 678", "254712345678"),
        ("0712-345-678", "254712345678"),
        ("712345678", "254712345678"),
    ],
)
def test_normalize_kenyan_phone(raw, expected):
    assert normalize_kenyan_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "abc", "0712345", "0812345678", "254812345678", "+447123456789"],
)
def test_invalid_phone_is_rejected(raw):
    with pytest.raises(ValueError):
        normalize_kenyan_phone(raw)


def test_utc_iso_marks_utc_with_z():
    from datetime import datetime, timezone

    value = datetime(2026, 12, 1, 9, 30, tzinfo=timezone.utc)
    assert utc_iso(value) == "2026-12-01T09:30:00Z"


def test_utc_iso_treats_naive_as_utc():
    from datetime import datetime

    assert utc_iso(datetime(2026, 12, 1, 9, 30)) == "2026-12-01T09:30:00Z"
