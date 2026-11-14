"""Alembic environment, configured for an async SQLAlchemy engine.

Alembic uses this file both when generating migrations (autogenerate) and when
applying them. We keep the database URL in one place: our validated Settings.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.core.database import Base

# Importing the models package registers every table on Base.metadata, which
# is what autogenerate compares against the live database.
import app.models  # noqa: F401

# Alembic's Config object, backed by alembic.ini.
config = context.config

# Set up Python logging from the ini file.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Read DATABASE_URL from .env / environment and hand it to Alembic.
config.set_main_option("sqlalchemy.url", get_settings().DATABASE_URL)

# The metadata describing what the database *should* look like.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without connecting to a database."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Configure Alembic against a live (sync-wrapped) connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run the migrations through it."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
