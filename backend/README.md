# backend — Gari Poa backend

FastAPI + async SQLAlchemy + PostgreSQL. Single-tenant MVP.

## Layout

```
app/
  api/        shared dependencies (auth, permissions)
  core/       config, database engine/session, security helpers
  models/     SQLAlchemy ORM models
  routers/    HTTP routes
  schemas/    Pydantic request/response models
  services/   business logic
scripts/      operational scripts (seeding)
alembic/      migrations
tests/        pytest suite (PostgreSQL only)
```

## Environment

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Async PostgreSQL URL, e.g. `postgresql+asyncpg://autohire:autohire@localhost:5433/autohire` |
| `JWT_SECRET` | Access-token signing key (32+ chars) |
| `ENCRYPTION_KEY` | Fernet key for PII encryption |

For tests:

| Variable | Purpose |
|---|---|
| `TEST_DATABASE_URL` | PostgreSQL URL whose database name ends in `_test` |

The provided `docker-compose.yml` starts PostgreSQL on host port **5433** and
creates `autohire` and `autohire_test`. It never touches a system PostgreSQL
on port 5432.

Without Docker, use the user-owned cluster helper:

```bash
./scripts/dev_postgres.sh init    # first time
./scripts/dev_postgres.sh start
./scripts/dev_postgres.sh status
```

See `ENVIRONMENT_SETUP.md` at the repo root for the complete variable list and
all setup options.

## Run

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

- Health: `GET http://localhost:8000/health`
- OpenAPI: `http://localhost:8000/docs`

## Migrations

```bash
alembic upgrade head
alembic check
```

## Tests

The suite runs against PostgreSQL, never SQLite. Start the database first:

```bash
# from the backend folder
docker compose up -d db
```

Then, from `backend`:

```bash
source .venv/bin/activate

# Defaults to the docker-compose test database
pytest -v

# Or point at another PostgreSQL test database
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/myapp_test pytest -v
```

Safety guard: pytest refuses to run if the database name does not end in
`_test`. The schema is created once per session and every test starts from
empty tables.

## Seed the first owner

```bash
OWNER_DEFAULT_PASSWORD='a-strong-password' python -m scripts.seed_owner
```

This creates `owner@autohire.ke` with role `owner`. It is idempotent.
