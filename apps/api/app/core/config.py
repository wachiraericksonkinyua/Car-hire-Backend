"""Application configuration.

Settings are read from environment variables, falling back to the values in
the local `.env` file. If a required value is missing or invalid, Pydantic
raises a `ValidationError` immediately so the app fails fast instead of
starting with a broken configuration.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Tell pydantic-settings to load values from `.env` in the current
    # working directory. Real environment variables take priority over it.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Connection string for the async PostgreSQL database.
    # Example: postgresql+asyncpg://postgres:postgres@localhost:5432/autohire_ke
    DATABASE_URL: str

    # Secret used to sign JWTs. The minimum length keeps weak secrets out.
    JWT_SECRET: str = Field(min_length=32)

    # Key used to encrypt sensitive values. Also enforced to be reasonably long.
    ENCRYPTION_KEY: str = Field(min_length=32)


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    The first call reads and validates the environment. Later calls reuse the
    same object, so we do not re-parse the environment on every request.
    """
    return Settings()
