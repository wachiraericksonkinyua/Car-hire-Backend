"""Application configuration.

Settings are read from environment variables, falling back to the values in
the local `.env` file. If a required value is missing or invalid, Pydantic
raises a `ValidationError` immediately so the app fails fast instead of
starting with a broken configuration.

Nothing in this project should read `os.getenv` directly: add the setting here
instead so it is validated and documented in one place.
"""

from functools import lru_cache

from pydantic import Field, field_validator
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
    # Example: postgresql+asyncpg://autohire:autohire@localhost:5433/autohire
    DATABASE_URL: str

    # Used by the pytest suite only. The database name must end in `_test`.
    TEST_DATABASE_URL: str | None = None

    # Secret used to sign JWTs. The minimum length keeps weak secrets out.
    JWT_SECRET: str = Field(min_length=32)

    # Key used to encrypt sensitive values. Also enforced to be reasonably long.
    ENCRYPTION_KEY: str = Field(min_length=32)

    # --- Auth lifetimes ---------------------------------------------------
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, ge=1)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1)

    # --- Booking rules ----------------------------------------------------
    # How long a Reserved booking keeps the vehicle before it expires.
    HOLD_MINUTES: int = Field(default=30, ge=1)
    # Cleaning/turnaround gap required between two rentals of the same car.
    TURNAROUND_BUFFER_MINUTES: int = Field(default=60, ge=0)

    # --- Pricing (all money is integer KES) -------------------------------
    VAT_PERCENT: int = Field(default=16, ge=0, le=100)
    BABY_SEAT_KES_PER_DAY: int = Field(default=500, ge=0)
    ROOFTOP_TENT_KES_PER_DAY: int = Field(default=2500, ge=0)
    COOLER_BOX_KES_PER_DAY: int = Field(default=300, ge=0)
    AIRPORT_PICKUP_KES: int = Field(default=1500, ge=0)
    DRIVER_FEE_IN_TOWN_KES_PER_DAY: int = Field(default=2500, ge=0)
    DRIVER_FEE_UPCOUNTRY_KES_PER_DAY: int = Field(default=4000, ge=0)
    # Chauffeur bookings pay a reduced refundable deposit.
    CHAUFFEUR_DEPOSIT_PERCENT: int = Field(default=50, ge=0, le=100)

    # --- Handover / overdue ----------------------------------------------
    LATE_FEE_GRACE_MINUTES: int = Field(default=120, ge=0)
    LATE_FEE_PER_HOUR_KES: int = Field(default=500, ge=0)
    EXCESS_MILEAGE_KES_PER_KM: int = Field(default=50, ge=0)

    # --- Login rate limiting (in-process, per worker) ---------------------
    LOGIN_RATE_LIMIT_ATTEMPTS: int = Field(default=5, ge=1)
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=300, ge=1)

    # --- Storage dashboard -----------------------------------------------
    # Used only for the usage bar. Set this to your database plan's quota.
    DATABASE_STORAGE_QUOTA_MB: int = Field(default=500, ge=1)

    # --- CORS -------------------------------------------------------------
    # Comma-separated list of allowed frontend origins.
    # Example: http://localhost:5173,https://dashboard.autohire.co.ke
    CORS_ORIGINS: str = ""

    # --- Safaricom Daraja (M-Pesa) ---------------------------------------
    MPESA_BASE_URL: str = "https://sandbox.safaricom.co.ke"
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = "174379"
    MPESA_PASSKEY: str = ""
    MPESA_CALLBACK_URL: str = (
        "https://example.com/api/v1/payments/mpesa/callback"
    )
    # Paybill uses CustomerPayBillOnline; Buy Goods (Till) uses
    # CustomerBuyGoodsOnline.
    MPESA_TRANSACTION_TYPE: str = "CustomerPayBillOnline"

    # --- SMS notifications (Africa's Talking) ----------------------------
    AFRICASTALKING_USERNAME: str = ""
    AFRICASTALKING_API_KEY: str = ""
    AFRICASTALKING_SENDER_ID: str = ""

    @field_validator("DATABASE_URL", "TEST_DATABASE_URL", mode="before")
    @classmethod
    def _force_async_driver(cls, value):
        """Accept plain PostgreSQL URLs and select the asyncpg driver.

        Supabase (and most providers) hand out `postgresql://...`; this app
        must use `postgresql+asyncpg://...`.
        """
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return "postgresql+asyncpg://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            return "postgresql+asyncpg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS_ORIGINS into a clean list for the CORS middleware."""
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    The first call reads and validates the environment. Later calls reuse the
    same object, so we do not re-parse the environment on every request.
    """
    return Settings()
