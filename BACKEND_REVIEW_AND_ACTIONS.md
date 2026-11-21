# AutoHire KE — Backend Review & Action List

_Last updated: after Micro-Step 12 — 29 tests passing, `alembic check` still failing (see §6)._

This document is the hand-off list: what the backend looks like today, what I still need **you** to provide or decide, and the code fixes I should make next.

---

## 1. Architecture at a glance

```
┌──────────────────────────────┐
│ Frontend (frontend/apps/web)          │  ← not built yet
│ React 19 + Vite              │
└──────────────┬───────────────┘
               │ HTTPS, credentials: 'include'
               │ (HttpOnly access_token cookie)
               ▼
┌──────────────────────────────────────────────────────────┐
│ FastAPI  (backend/app/main.py)                          │
│                                                          │
│  routers/   auth · vehicles · bookings · payments ·      │
│             mechanics · health                           │
│      │                                                   │
│  schemas/   request/response validation (Pydantic v2)    │
│      │                                                   │
│  services/  auth · booking · payment · mechanic          │
│      │                                                   │
│  models/    User · Vehicle · Booking · Payment · Mechanic│
│      │                                                   │
│  core/      config · database (async SQLAlchemy) ·       │
│             security (Argon2, JWT, Fernet)               │
└───────┬───────────────────────────────┬──────────────────┘
        │ asyncpg                       │ HTTPS
        ▼                               ▼
┌──────────────────┐          ┌─────────────────────────┐
│ PostgreSQL       │          │ Safaricom Daraja API    │
│ (Alembic)        │          │ OAuth + STK Push +      │
└──────────────────┘          │ callback webhook        │
                              └─────────────────────────┘
```

**Design choices**
- Single-company, no `tenant_id`.
- All money is `Integer` KES — no floats.
- JWT lives in an `HttpOnly` cookie (`SameSite=lax`, `Secure`), not `localStorage`.
- Roles: `admin`, `manager`, `agent`, `driver`, `mechanic`, `customer`.
- PII helpers (`encrypt_pii` / `decrypt_pii`) exist, but no field uses them yet.

### Endpoints today

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public; runs `SELECT 1` |
| POST | `/api/v1/auth/login` | public; sets cookie |
| GET | `/api/v1/auth/me` | cookie |
| GET | `/api/v1/vehicles` | public (filter `status`, `category`) |
| GET | `/api/v1/vehicles/{id}` | public |
| POST | `/api/v1/bookings` | cookie |
| PATCH | `/api/v1/bookings/{id}/approve-offline` | admin / manager |
| POST | `/api/v1/payments/stk-push` | cookie |
| POST | `/api/v1/payments/mpesa/callback` | public webhook |
| GET | `/api/v1/mechanics/nearest` | public (`lat`, `lng`, `limit`) |

### Test status

```
29 passed, 1 warning
```

Tests use in-memory SQLite, so they do **not** prove PostgreSQL-only behaviour (row locks, enums, timezone handling).

---

## 2. What I need from you — checklist

Copy this list and fill in the blanks. Everything here is something I cannot generate or discover myself.

### A. PostgreSQL access — **blocking**

Right now Postgres is running on `localhost:5432`, but the credentials in `.env` fail:

```
password authentication failed for user "postgres"
```

I need one of:

- [ ] The correct password for an existing Postgres role, **or**
- [ ] Permission/instructions to create a dedicated role and database.

Recommended local setup (run as a Postgres superuser):

```sql
CREATE USER autohire WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE autohire_ke OWNER autohire;
GRANT ALL PRIVILEGES ON DATABASE autohire_ke TO autohire;
```

Then `backend/.env` becomes:

```env
DATABASE_URL=postgresql+asyncpg://autohire:choose-a-strong-password@localhost:5432/autohire_ke
```

Also tell me if production will use a managed provider (Neon, Supabase, Railway, RDS, etc.) and send me its connection string — **I only need it at deploy time, never paste production secrets in chat if you can avoid it; put them in `.env`/host secrets directly.**

**Why:** without this I cannot run migrations, `alembic check`, or test against real Postgres.

---

### B. Secrets for this deployment

Already generated for local/dev in `backend/.env`:
- `JWT_SECRET` (64-char URL-safe token)
- `ENCRYPTION_KEY` (valid Fernet key)

For **production**, generate fresh ones (do not reuse dev values):

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Where they go: your host's secret manager / environment variables (`JWT_SECRET`, `ENCRYPTION_KEY`), not git.

- [ ] Confirm you will generate and store production secrets separately.
- [ ] Rotating `ENCRYPTION_KEY` later requires re-encrypting stored PII — decide who owns key rotation.

---

### C. Safaricom M-Pesa (Daraja) — **needed for real payments**

Sign up / log in at **https://developer.safaricom.co.ke** and create an app (start in Sandbox).

I need these six values:

| Env var | What it is | Where to get it |
|---|---|---|
| `MPESA_CONSUMER_KEY` | App consumer key | Daraja portal → My Apps → your app |
| `MPESA_CONSUMER_SECRET` | App consumer secret | Same page |
| `MPESA_SHORTCODE` | Paybill/Till number | Sandbox: `174379`; production: your Paybill/Till |
| `MPESA_PASSKEY` | Lipa na M-Pesa Online passkey | Sandbox: Daraja test credentials page; production: issued with your Paybill |
| `MPESA_CALLBACK_URL` | Public HTTPS URL Safaricom posts results to | Your deployed API, or a tunnel while developing |
| `MPESA_BASE_URL` | API host | Sandbox `https://sandbox.safaricom.co.ke`; production `https://api.safaricom.co.ke` |

**Callback URL** must be publicly reachable over HTTPS, e.g.:

```
https://your-api.example.com/api/v1/payments/mpesa/callback
```

For local development, run a tunnel and use its HTTPS URL:

```bash
ngrok http 8000
# or: cloudflared tunnel --url http://localhost:8000
```

**Production go-live** also requires a real Paybill/Till (from Safaricom) and a Go Live request in the Daraja portal.

Decisions needed:

- [ ] Do you have a **Paybill** or **Buy Goods (Till)** number? The code currently uses `CustomerPayBillOnline`; Till numbers need `CustomerBuyGoodsOnline`.
- [ ] Sandbox credentials for development.
- [ ] Production shortcode/passkey and callback domain.
- [ ] Confirm the M-Pesa account name customers will see.

> ⚠️ Current code reads these via `os.getenv(...)` at **import time**, so values in `.env` are **not** picked up (only real process environment variables are). I will fix this as part of the next code step — see §5.1. Until then, export them in the shell:
>
> ```bash
> export MPESA_CONSUMER_KEY=...
> export MPESA_CONSUMER_SECRET=...
> export MPESA_SHORTCODE=174379
> export MPESA_PASSKEY=...
> export MPESA_CALLBACK_URL=https://.../api/v1/payments/mpesa/callback
> ```

---

### D. Admin account

The seed script creates `admin@autohire.ke` with a default password unless you override it.

- [ ] Give me the password to use (or set it yourself):

```bash
cd backend
ADMIN_DEFAULT_PASSWORD='a-strong-password' ./.venv/bin/python -m scripts.seed_admin
```

- [ ] Confirm the admin email (`admin@autohire.ke`) or give the one you want.
- [ ] There is currently **no password-change endpoint** — decide whether we add one before launch.

---

### E. Hosting, domain and HTTPS

The login cookie is `Secure`, so browsers only send it over HTTPS (localhost is usually exempted, a LAN IP over HTTP is not).

- [ ] Where will the API run? (Render / Fly.io / Railway / AWS / VPS / your own machine)
- [ ] Domain name for the API (e.g. `api.autohire.co.ke`) and TLS certificate.
- [ ] Where will PostgreSQL live? (managed service recommended)

---

### F. Frontend origin / CORS decision

- [ ] Will the web app be served from the **same origin** as the API (e.g. `https://autohire.co.ke` + reverse proxy) or a **different origin** (e.g. `https://app.autohire.co.ke` → `https://api.autohire.co.ke`)?

The API currently has **no CORS middleware**. Same-origin is simplest and keeps the cookie safe. Different-origin needs `allow_origins`, `allow_credentials=True`, and frontend `fetch(..., { credentials: "include" })`.

---

### G. Business rules to confirm

These were implemented with assumptions; please confirm or correct:

- [ ] **Security deposit:** 50% of (rental + chauffeur) is added to `total_kes`. Is it meant to be part of the amount charged, or a separate refundable line?
- [ ] **Chauffeur fee:** KES 2,500 per day when requested. Correct?
- [ ] **Hold window:** 30 minutes before a reservation can be released. Correct?
- [ ] **Rental days:** calculated as `end_date - start_date` (so Dec 1 → Dec 5 = 4 days). Correct, or inclusive of the return day?
- [ ] **Booking flow:** reserved → (paid or approved) → confirmed → completed. Should staff also be able to cancel/complete bookings? (No endpoints yet.)

---

### H. Optional integrations (tell me if/when you want them)

| Need | Provider | Key/credential | Where |
|---|---|---|---|
| SMS notifications (booking confirmed, driver assigned) | Africa's Talking | API key + username + sender ID | https://africastalking.com |
| Transactional email | Resend / Postmark / SES | API key, verified domain | provider dashboard |
| Map + geocoding on frontend | Google Maps Platform / Mapbox | API key (restricted to your domains) | https://console.cloud.google.com / https://mapbox.com |
| Error monitoring | Sentry | DSN | https://sentry.io |
| Analytics | PostHog / Plausible | project key | provider dashboard |

---

### I. Legal / compliance (Kenya)

You are storing customer names, phone numbers and later national IDs / driving licence numbers, so:

- [ ] Register as a **data controller/processor** with the Office of the Data Protection Commissioner (ODPC) — https://www.odpc.go.ke
- [ ] Provide a privacy policy and a data-retention/deletion policy.
- [ ] Decide how long encrypted KYC documents are kept after a rental ends.
- [ ] Confirm whether you need to collect KRA PIN for corporate customers.

---

## 3. What I will do once you answer

Ordered by dependency:

1. **Fix M-Pesa configuration** — move all `MPESA_*` values into `Settings`, add them to `.env.example`, validate at startup.
2. **Connect to the real database** — update `.env`, run `alembic upgrade head`.
3. **Generate the missing migration** for `vehicles`, `bookings`, `payments`, `mechanics`, then make `alembic check` pass.
4. **Harden payments** (see §4) — ownership checks, server-side amount, callback protection.
5. **Add operations gaps** — hold-expiry cleanup, booking list/cancel/complete, admin CRUD for vehicles/mechanics, logout.
6. **Wire the frontend** — scaffold `frontend/apps/web`, login with cookie, vehicle list, booking flow, M-Pesa prompt.
7. **Deployment** — Dockerfile, env/secrets, HTTPS, CORS (if needed), CI running the 29+ tests.

---

## 4. Review findings — must fix before production

I found these while reading the whole backend. None break the current tests, but several are real risks.

| # | Severity | Issue | Suggested fix |
|---|---|---|---|
| 1 | 🔴 Critical | **Payment amount is client-controlled.** `/payments/stk-push` accepts `amount` from the request; a customer can pay KES 1 and the callback still marks the booking confirmed. | Derive/validate `amount == booking.total_kes` server-side; ignore client amount. |
| 2 | 🔴 Critical | **No ownership check on STK push.** Any authenticated user can push a payment for any `booking_id`. | Load booking, require `booking.user_id == payload["sub"]`. |
| 3 | 🔴 Critical | **M-Pesa env vars are read with `os.getenv` at import**, so `.env` values are ignored and changes need a restart. | Move into `Settings`; pass from config. |
| 4 | 🟠 High | **No migration for 4 of 5 tables**; `alembic check` reports drift. | Autogenerate a second migration after DB access is fixed. |
| 5 | 🟠 High | **No hold-expiry job.** Abandoned checkouts leave vehicles `reserved` forever. | Periodic job/cron to release `reserved` vehicles past `hold_expires_at`. |
| 6 | 🟠 High | **Callback is unauthenticated.** Safaricom does not sign callbacks; anyone who knows a `CheckoutRequestID` can post a fake success. | IP allowlist Safaricom ranges, add an unguessable path/secret, verify amount + receipt uniqueness, make it idempotent. |
| 7 | 🟡 Medium | **No CORS** and `Secure` cookie → frontend on another origin won't work without changes. | Decide same-origin vs CORS + `credentials`. |
| 8 | 🟡 Medium | **No logout / token revocation / refresh.** Stolen cookie valid for 1 hour. | Add `/auth/logout` clearing the cookie; consider short-lived tokens + refresh. |
| 9 | 🟡 Medium | **`db.begin()` in `create_booking` assumes no active transaction.** Fine with a fresh request session, but fragile if reused. | Use autobegin or `begin_nested()` when already in a transaction. |
| 10 | 🟡 Medium | **No admin CRUD**: vehicles and mechanics can only be inserted via scripts/SQL. | Add admin-only create/update/deactivate endpoints. |
| 11 | 🟡 Medium | **No booking list/cancel/complete endpoints.** Customers and staff can't see bookings. | Add filtered lists + cancel/complete transitions. |
| 12 | 🟢 Low | Vehicle list has no pagination. | Add `limit`/`offset` before inventory grows. |
| 13 | 🟢 Low | `README.md` says `uv sync` but there's no `pyproject.toml`/`uv.lock`; setup uses pip + `requirements.txt`. Also references a missing `backend/README.md`. | Choose uv or pip and make the docs match. |
| 14 | 🟢 Low | M-Pesa phone numbers aren't normalised/validated (`07…`, `+254…`, `254…`). | Normalise to `2547XXXXXXXX` before sending. |
| 15 | 🟢 Low | Tests use SQLite, so `FOR UPDATE` and Postgres enums/timezones aren't exercised. | Add a Postgres-backed CI job. |

---

## 5. Environment variable reference

| Variable | Required now | Example | Source |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://autohire:***@localhost:5432/autohire_ke` | you / hosting provider |
| `JWT_SECRET` | ✅ | 48+ random chars | generate yourself |
| `ENCRYPTION_KEY` | ✅ | 44-char Fernet key | generate yourself |
| `ADMIN_DEFAULT_PASSWORD` | seed only | strong password | you |
| `MPESA_CONSUMER_KEY` | for payments | from Daraja app | Safaricom |
| `MPESA_CONSUMER_SECRET` | for payments | from Daraja app | Safaricom |
| `MPESA_SHORTCODE` | for payments | `174379` (sandbox) | Safaricom |
| `MPESA_PASSKEY` | for payments | long passkey string | Safaricom |
| `MPESA_CALLBACK_URL` | for payments | `https://…/api/v1/payments/mpesa/callback` | your domain / tunnel |
| `MPESA_BASE_URL` | optional | `https://sandbox.safaricom.co.ke` | Safaricom |

---

## 6. Current blockers (why some things are red)

1. **Postgres auth fails** → cannot migrate, cannot run `alembic check`, cannot test real row locking.
2. **Only the `users` migration exists** → even with a database, `alembic check` will report `vehicles`, `bookings`, `payments`, `mechanics` as missing.
3. **No M-Pesa credentials** → STK push can't be exercised against Safaricom; tests mock the network call.

---

## 7. Quick command reference

```bash
cd backend

# run tests
./.venv/bin/python -m pytest -v

# run the API
./.venv/bin/uvicorn app.main:app --reload --port 8000

# health check (needs a working DB)
curl http://localhost:8000/health

# migrations
./.venv/bin/alembic upgrade head
./.venv/bin/alembic check

# create an admin
ADMIN_DEFAULT_PASSWORD='a-strong-password' ./.venv/bin/python -m scripts.seed_admin
```

---

## 8. One-line answer sheet

If you want the shortest possible reply, fill this in:

```
Postgres URL:        postgresql+asyncpg://___:___@___:___/___
M-Pesa sandbox?:     yes / no
Paybill or Till:     ________  (number: ________)
Callback domain:     https://________________________
Admin email:         ________________________
Admin password:      ________________________  (or "generate for me")
Hosting provider:    ________________________
Frontend origin:     same-origin / https://________________________
Deposit rule OK?:    yes / no — correction: ________________________
SMS needed?:         yes (Africa's Talking) / no
```
