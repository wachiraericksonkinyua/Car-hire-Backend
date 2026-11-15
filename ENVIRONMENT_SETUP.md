# Environment Setup — AutoHire KE Backend

Everything needed to run the FastAPI backend locally: services, environment
variables, database setup, migrations, tests, and verification.

> This repo is backend-only. No Redis/Mongo/Node is used.
> Services: **FastAPI + PostgreSQL**. Background jobs run inside the API via
> APScheduler.

---

## 1. What you need

| Requirement | Version / notes |
|---|---|
| Python | 3.12 |
| PostgreSQL | 16 |
| pip + venv | system Python packages |
| Docker + Compose | **optional** (not installed on this machine) |
| M-Pesa Daraja credentials | optional for tests; required for real STK push |
| Africa's Talking credentials | optional; SMS silently disabled without them |

On this machine:
- The **system PostgreSQL** is on port `5432` and must not be touched.
- The app database is **Supabase PostgreSQL** (session pooler, port 5432, SSL).
- A **user-owned local cluster** on port **5433** is used for the destructive
  pytest database (`autohire_test`). It is optional if you use a separate
  Supabase test project.
- Docker is not installed, so the compose file is provided for other machines.

---

## 2. Quick start (current machine, no Docker)

```bash
# 1. Project + virtualenv
cd ~/car-hire/apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Local PostgreSQL (already initialised; this starts it)
cd ~/car-hire
./scripts/dev_postgres.sh start

# 3. Environment
cd apps/api
cp .env.example .env     # already exists on this machine
# edit secrets / M-Pesa values as needed

# 4. Database schema
alembic upgrade head
alembic check

# 5. Run
uvicorn app.main:app --reload --port 8000
```

Verify:

```bash
curl -s http://localhost:8000/health
# {"success":true,"data":{"status":"healthy","database":"connected"},"error":null}
```

---

## 3. PostgreSQL

### Option 0 — Supabase (current app database)

Use the **Session pooler** URI from Supabase (port `5432`), not the transaction
pooler (`6543`), for migrations and asyncpg.

```env
DATABASE_URL=postgresql+asyncpg://postgres.<ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?ssl=require
```

Rules:
- change `postgresql://` to `postgresql+asyncpg://`,
- **URL-encode the password** (`@` → `%40`, `:` → `%3A`, `/` → `%2F`),
- keep `?ssl=require`,
- enable `btree_gist` in Database → Extensions (or the migration creates it),
- use a **separate Supabase project** for tests if you don't want to use the
  local cluster; tests drop and recreate the `public` schema.

### Option A — user-owned cluster (local tests here)

`scripts/dev_postgres.sh` manages a cluster under
`~/.local/share/autohire/postgres` on port **5433**. It never uses sudo and
never touches the system cluster.

```bash
./scripts/dev_postgres.sh init     # first time: initdb + start + create DBs
./scripts/dev_postgres.sh start
./scripts/dev_postgres.sh status
./scripts/dev_postgres.sh stop
```

It creates:

| Database | Purpose |
|---|---|
| `autohire` | application data |
| `autohire_test` | pytest only (destructive) |

Credentials (development only):

```
host: 127.0.0.1
port: 5433
user: autohire
password: autohire
```

### Option B — Docker Compose

`docker-compose.yml` runs PostgreSQL 16 on host port **5433** and creates the
same two databases.

```bash
docker compose up -d db
docker compose ps
```

If you use this, **stop the local cluster first** (they share port 5433):

```bash
./scripts/dev_postgres.sh stop
```

### Option C — existing/system PostgreSQL

Create a dedicated role and databases (requires a superuser):

```sql
CREATE USER autohire WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE autohire OWNER autohire;
CREATE DATABASE autohire_test OWNER autohire;
```

Then set `DATABASE_URL`/`TEST_DATABASE_URL` to that server, and ensure
`btree_gist` can be created (the migration runs
`CREATE EXTENSION IF NOT EXISTS btree_gist`):

```sql
\c autohire
CREATE EXTENSION btree_gist;
\c autohire_test
CREATE EXTENSION btree_gist;
```

> `btree_gist` is a trusted extension in PostgreSQL 16, so the database owner
> can install it. If your provider restricts this, a superuser must run it once.

---

## 4. Environment variables

Copy `.env.example` → `.env` (never commit `.env`; it is gitignored).
The app loads `.env` from the **current working directory**, so run commands
from `apps/api`.

### Required

| Variable | Example | Where it comes from |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://autohire:autohire@127.0.0.1:5433/autohire` | your DB |
| `JWT_SECRET` | 48+ random chars | generate yourself |
| `ENCRYPTION_KEY` | Fernet key | generate yourself |

Generate:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Tests

| Variable | Example | Notes |
|---|---|---|
| `TEST_DATABASE_URL` | `postgresql+asyncpg://autohire:autohire@127.0.0.1:5433/autohire_test` | database name **must** end in `_test` |

### Auth / booking / pricing

| Variable | Default |
|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 |
| `HOLD_MINUTES` | 30 |
| `TURNAROUND_BUFFER_MINUTES` | 60 |
| `VAT_PERCENT` | 16 |
| `BABY_SEAT_KES_PER_DAY` | 500 |
| `ROOFTOP_TENT_KES_PER_DAY` | 2500 |
| `COOLER_BOX_KES_PER_DAY` | 300 |
| `AIRPORT_PICKUP_KES` | 1500 |
| `DRIVER_FEE_IN_TOWN_KES_PER_DAY` | 2500 |
| `DRIVER_FEE_UPCOUNTRY_KES_PER_DAY` | 4000 |
| `CHAUFFEUR_DEPOSIT_PERCENT` | 50 |
| `LATE_FEE_GRACE_MINUTES` | 120 |
| `LATE_FEE_PER_HOUR_KES` | 500 |
| `EXCESS_MILEAGE_KES_PER_KM` | 50 |
| `LOGIN_RATE_LIMIT_ATTEMPTS` | 5 |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | 300 |
| `CORS_ORIGINS` | comma-separated frontend origins |

### M-Pesa (Daraja)

Create an app at <https://developer.safaricom.co.ke>.

| Variable | Notes |
|---|---|
| `MPESA_BASE_URL` | sandbox `https://sandbox.safaricom.co.ke`; production `https://api.safaricom.co.ke` |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | from your Daraja app |
| `MPESA_SHORTCODE` | sandbox `174379`; production Paybill/Till |
| `MPESA_PASSKEY` | Lipa na M-Pesa passkey |
| `MPESA_CALLBACK_URL` | public HTTPS URL ending `/api/v1/payments/mpesa/callback` |
| `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` (Paybill) or `CustomerBuyGoodsOnline` (Till) |

Locally, expose the callback with a tunnel:

```bash
ngrok http 8000
# then set MPESA_CALLBACK_URL=https://<ngrok-host>/api/v1/payments/mpesa/callback
```

### SMS (Africa's Talking)

| Variable | Notes |
|---|---|
| `AFRICASTALKING_USERNAME` | account username |
| `AFRICASTALKING_API_KEY` | API key |
| `AFRICASTALKING_SENDER_ID` | optional sender ID |

SMS is best-effort: without credentials it is a no-op and never blocks a
booking or driver assignment.

---

## 5. Database migrations

Run from `apps/api`:

```bash
source .venv/bin/activate
alembic upgrade head
alembic check          # must say: No new upgrade operations detected
```

Migration order currently:

```
33e45a50ff2e  initial postgres schema
f5556217b104  payment callback hardening
f3174f8d274b  vehicle inspections
bf6ee136b967  driver assignment and trip status
548a49718ef1  mechanic directory and incident flags
```

Never edit an applied migration; add a new revision.

---

## 6. Seed the first owner

```bash
cd apps/api
OWNER_DEFAULT_PASSWORD='a-strong-password' \
  ./.venv/bin/python -m scripts.seed_owner
```

Creates `owner@autohire.ke` with role `owner`. The script is idempotent.
`OWNER_DEFAULT_PASSWORD` is read at runtime, not from `.env`.

> On this machine an owner has already been seeded. Use the password provided
> separately in chat; there is no password-change endpoint yet.

---

## 7. Tests

The suite uses **PostgreSQL only** — never SQLite. It drops/recreates the
`public` schema in the test database and applies every migration.

```bash
cd apps/api
pytest -q
# or explicitly:
TEST_DATABASE_URL=postgresql+asyncpg://autohire:autohire@127.0.0.1:5433/autohire_test pytest -q
```

Safety guard: the database name must end in `_test`; otherwise pytest refuses
to run. **Never point `TEST_DATABASE_URL` at your application database.**

Useful subsets:

```bash
pytest tests/test_payments.py -q
pytest tests/test_booking_endpoints.py -q
pytest -k "pricing or dashboard" -q
```

---

## 7a. Frontend (two deployables)

The frontend is an npm workspace with two app shells (`apps/web`,
`apps/admin`) sharing `packages/frontend`. Install once from the repo root:

```bash
npm install

npm run dev:web     # customer site, http://localhost:5173
npm run dev:admin   # staff back-office, http://localhost:5174
```

Build separately:

```bash
npm run build:web   # apps/web/dist
npm run build:admin # apps/admin/dist
```

Both origins are in `CORS_ORIGINS`. Both apps use the real API; set
`VITE_API_BASE_URL` in each app's `.env.local` if the API is not on
`http://localhost:8000`.

Optional demo data (users, vehicles, bookings, incidents, mechanics):

```bash
cd apps/api
source .venv/bin/activate
python -m scripts.seed_demo
```

All demo accounts use `AutoHireDemo123!`; the seeded owner is
`amina@autohire.ke`.

## 8. Run the API

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

- Health: <http://localhost:8000/health>
- Swagger UI: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/openapi.json>

Background jobs start with the app:
- hold expiry every minute,
- overdue flagging every 5 minutes.

---

## 9. First requests

```bash
# Login
curl -i -c /tmp/ah.cookies -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@autohire.ke","password":"<owner-password>"}'

# The response contains access_token; use it as a Bearer token.
TOKEN='<access_token>'
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/auth/me
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/dashboard
```

Refresh/logout use the HttpOnly cookie, so keep `-b /tmp/ah.cookies`:

```bash
curl -i -b /tmp/ah.cookies -c /tmp/ah.cookies -X POST http://localhost:8000/api/v1/auth/refresh
curl -i -b /tmp/ah.cookies -X POST http://localhost:8000/api/v1/auth/logout
```

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'psycopg'` | The URL starts with `postgresql://`; use `postgresql+asyncpg://` (the app now auto-converts plain Postgres URLs, but check for `postgresql+psycopg://`). |
| `invalid interpolation syntax ... %40` during Alembic | Percent-encoded passwords are now escaped in `alembic/env.py`; pull the latest code. |
| `gaierror: Name or service not known` | An unescaped `@`/`:` in the password made SQLAlchemy read part of it as the host. URL-encode the password. |
| `password authentication failed` | Check `DATABASE_URL` user/password/port. The system DB on 5432 is not the dev DB. |
| `Connection refused` on 5433 | `./scripts/dev_postgres.sh start` |
| `type "btree_gist" does not exist` / extension error | `CREATE EXTENSION btree_gist` as DB owner/superuser |
| `alembic check` says database not up to date | `alembic upgrade head` |
| pytest refuses to run | `TEST_DATABASE_URL` database name must end in `_test` |
| Login cookie not sent | Cookies are `Secure`; use HTTPS or localhost, and send with `-b`. |
| STK push says missing M-Pesa settings | Fill all `MPESA_*` values; the callback URL must be public HTTPS. |
| SMS not sent | Expected without `AFRICASTALKING_*`; assignment still succeeds. |
| Port 5433 busy | Another cluster/compose is running. Stop one: `./scripts/dev_postgres.sh stop` or `docker compose stop db`. |
| Port 8000 busy | `uvicorn ... --port 8001` |

---

## 11. Useful commands

```bash
# Database
./scripts/dev_postgres.sh status
PGPASSWORD=autohire psql -h 127.0.0.1 -p 5433 -U autohire -d autohire

# Migrations
cd apps/api && ./.venv/bin/alembic upgrade head
cd apps/api && ./.venv/bin/alembic check

# Tests
cd apps/api && ./.venv/bin/pytest -q

# Seed owner
cd apps/api && OWNER_DEFAULT_PASSWORD='...' ./.venv/bin/python -m scripts.seed_owner

# API
cd apps/api && ./.venv/bin/uvicorn app.main:app --reload --port 8000
```
