# AutoHire KE - Car Hire Management System

Single-company car hire platform for Kenya.

- `apps/web` — React 19 + Vite customer and admin frontend
- `apps/api` — FastAPI + async SQLAlchemy + PostgreSQL backend

## Backend quickstart

```bash
cd apps/api
uv sync
cp .env.example .env   # add generated JWT_SECRET and ENCRYPTION_KEY
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

See `apps/api/README.md` for local PostgreSQL setup, seeding an admin, tests,
and the auth/RBAC contract.
