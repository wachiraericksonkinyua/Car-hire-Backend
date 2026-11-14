import pytest
from pydantic import ValidationError

from app.core.config import Settings

# A valid set of values used as the baseline for each test.
VALID_ENV = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:postgres@localhost:5432/autohire_ke",
    "JWT_SECRET": "a" * 40,
    "ENCRYPTION_KEY": "b" * 40,
}


def test_settings_loads_valid_values():
    # `_env_file=None` stops the real apps/api/.env file from leaking into
    # the test; we pass every value explicitly instead.
    settings = Settings(_env_file=None, **VALID_ENV)

    assert settings.DATABASE_URL == VALID_ENV["DATABASE_URL"]
    assert settings.JWT_SECRET == VALID_ENV["JWT_SECRET"]
    assert settings.ENCRYPTION_KEY == VALID_ENV["ENCRYPTION_KEY"]


def test_settings_requires_jwt_secret(monkeypatch):
    # Make sure a JWT_SECRET from the outer environment cannot satisfy this.
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            DATABASE_URL=VALID_ENV["DATABASE_URL"],
            ENCRYPTION_KEY=VALID_ENV["ENCRYPTION_KEY"],
        )


def test_settings_rejects_short_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            DATABASE_URL=VALID_ENV["DATABASE_URL"],
            JWT_SECRET="too-short",
            ENCRYPTION_KEY=VALID_ENV["ENCRYPTION_KEY"],
        )
