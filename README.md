# AutoHire KE — Backend

Car hire management API for Kenya.

- `apps/api` — FastAPI + async SQLAlchemy + PostgreSQL.

The backend is a single-tenant MVP. All application data lives in PostgreSQL.

## Requirements

- Python 3.12
- PostgreSQL 16 (Docker Compose is provided, or use your own local server)
- `pip` and `venv`

## Quickstart

Full prerequisites, every environment variable, database options and
troubleshooting: **[ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md)**.

No Docker? Use the user-owned PostgreSQL helper:

```bash
./scripts/dev_postgres.sh init    # first time
./scripts/dev_postgres.sh start
```

Or with Docker:

```bash
# 1. Start PostgreSQL (host port 5433 for the app, plus a test database)
docker compose up -d db

# 2. Create and activate the virtual environment
cd apps/api
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create your local settings
cp .env.example .env
# edit DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY

# 5. Apply migrations
alembic upgrade head

# 6. Run the API
uvicorn app.main:app --reload --port 8000
```

See `apps/api/README.md` for tests, the test database, and admin seeding.

## Conventions

- API base path: `/api/v1`
- Money: integer Kenyan Shillings (no floats)
- Datetimes: stored as `TIMESTAMPTZ`, returned as UTC ISO strings

API behaviour and the auth/role contract are documented in `apps/api/README.md`.
