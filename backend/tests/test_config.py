import pytest
from pydantic import ValidationError

from app.core.config import Settings

# A valid set of required values used as the baseline for each test.
VALID_ENV = {
    "DATABASE_URL": "postgresql+asyncpg://autohire:autohire@localhost:5433/autohire",
    "JWT_SECRET": "a" * 40,
    "ENCRYPTION_KEY": "b" * 40,
}


def _settings(**overrides) -> Settings:
    # `_env_file=None` stops the real backend/.env file from leaking into
    # the test; every value is passed explicitly instead.
    return Settings(_env_file=None, **{**VALID_ENV, **overrides})


def test_plain_postgres_url_is_forced_to_asyncpg():
    settings = _settings(
        DATABASE_URL="postgresql://user:pass@example.com/db"
    )

    assert settings.DATABASE_URL == (
        "postgresql+asyncpg://user:pass@example.com/db"
    )


def test_settings_loads_valid_values():
    settings = _settings()

    assert settings.DATABASE_URL == VALID_ENV["DATABASE_URL"]
    assert settings.JWT_SECRET == VALID_ENV["JWT_SECRET"]
    assert settings.ENCRYPTION_KEY == VALID_ENV["ENCRYPTION_KEY"]


def test_settings_requires_jwt_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            DATABASE_URL=VALID_ENV["DATABASE_URL"],
            ENCRYPTION_KEY=VALID_ENV["ENCRYPTION_KEY"],
        )


def test_settings_rejects_short_jwt_secret():
    with pytest.raises(ValidationError):
        _settings(JWT_SECRET="too-short")


def test_safe_defaults():
    settings = _settings()

    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 15
    assert settings.REFRESH_TOKEN_EXPIRE_DAYS == 7
    assert settings.HOLD_MINUTES == 30
    assert settings.TURNAROUND_BUFFER_MINUTES == 60
    assert settings.VAT_PERCENT == 16
    assert settings.LATE_FEE_GRACE_MINUTES == 120


def test_mpesa_settings_are_loaded():
    settings = _settings(
        MPESA_CONSUMER_KEY="key",
        MPESA_CONSUMER_SECRET="secret",
        MPESA_SHORTCODE="174379",
        MPESA_PASSKEY="passkey",
        MPESA_CALLBACK_URL="https://api.example.com/api/v1/payments/mpesa/callback",
    )

    assert settings.MPESA_CONSUMER_KEY == "key"
    assert settings.MPESA_SHORTCODE == "174379"
    assert settings.MPESA_TRANSACTION_TYPE == "CustomerPayBillOnline"


def test_cors_origins_are_parsed():
    settings = _settings(
        CORS_ORIGINS="http://localhost:5173, https://dashboard.autohire.co.ke ,"
    )

    assert settings.cors_origins == [
        "http://localhost:5173",
        "https://dashboard.autohire.co.ke",
    ]


def test_invalid_vat_percent_is_rejected():
    with pytest.raises(ValidationError):
        _settings(VAT_PERCENT=101)


def test_negative_hold_minutes_is_rejected():
    with pytest.raises(ValidationError):
        _settings(HOLD_MINUTES=0)
