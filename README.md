# AutoHire KE

Car hire management platform for Kenya.

- `apps/api` — FastAPI + async SQLAlchemy + PostgreSQL.
- `apps/web` — customer website (React 19 + Vite).
- `apps/admin` — staff workspace (React 19 + Vite).
- `packages/frontend` — shared React code used by both frontend apps.

The backend is a single-tenant MVP. All application data lives in PostgreSQL.

## Frontend

The frontend was imported from
`https://github.com/devmunguti/CarHire-frontend` at commit `426e379`.

The two frontend apps are separate Vite builds that share
`packages/frontend`. Install once from the repository root:

```bash
npm install
npm run dev:web     # customer app, http://localhost:5173
npm run dev:admin   # staff app,    http://localhost:5174
```

Two separately deployable builds:

```bash
npm run build:web     # apps/web/dist
npm run build:admin   # apps/admin/dist
```

Both apps are wired to the backend. The customer app uses the public API; the
admin app uses the authenticated staff API through a response adapter. See
`apps/api/FRONTEND_INTEGRATION.md` for the remaining gaps.

## Testing

Backend (needs the local test PostgreSQL):

```bash
./scripts/dev_postgres.sh start
cd apps/api
./.venv/bin/pytest -q
```

Frontend unit tests and type checks:

```bash
npm run type-check
npm test
```

Build verification:

```bash
npm run build
```

End-to-end smoke tests (Playwright starts each dev server automatically):

```bash
npm run test:e2e:web
npm run test:e2e:admin
```

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

## Backend quickstart

See `apps/api/README.md` for tests, the test database, and owner seeding.

## Conventions

- API base path: `/api/v1`
- Money: integer Kenyan Shillings (no floats)
- Datetimes: stored as `TIMESTAMPTZ`, returned as UTC ISO strings

API behaviour and the auth/role contract are documented in `apps/api/README.md`.
