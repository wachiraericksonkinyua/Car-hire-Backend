# Requirements Audit — Express/MongoDB Blueprint vs. Current Backend

_Audit date: after Micro-Step 12. Current suite: 29 tests passing._

## Headline

**No — the large majority of the listed requirements have not been built.**

There is also a **stack mismatch** that matters more than any individual checkbox:

| Blueprint asks for | This repo actually is |
|---|---|
| Node.js + Express | Python 3.12 + FastAPI |
| MongoDB Atlas + Mongoose | PostgreSQL + async SQLAlchemy |
| BullMQ + Redis | no queue/Redis |
| ESLint + Prettier | no linter config (Python; `.ruff_cache` is gitignored but Ruff isn't configured) |
| controllers/ middleware/ jobs/ utils/ | `routers/`, `services/`, `models/`, `schemas/`, `core/` |
| `requireRole(...)` | `require_role(...)` (equivalent) |
| `{ success, data, error }` envelope | raw FastAPI responses |
| GitHub Actions | none |
| Mongo transactions / `2dsphere` / `$nearSphere` | SQL transactions / Haversine in Python |

So the Node/Mongo-specific items cannot be "made" on this codebase without either adopting Node/Mongo or building **functional equivalents** in FastAPI/Postgres.

---

## Scorecard

Approximate, counting each distinct deliverable:

- ✅ **9 fully present**
- 🟡 **9 partially present** (equivalent exists but lacks required behaviour)
- ❌ **41 missing**

Per epic:

| Epic | Status | Coverage |
|---|---|---|
| 1. Foundation, auth, DevOps | 🟡 Partial | ~5 / 22 |
| 2. Bookings, pricing, holds | 🟡 Partial | ~3 / 11 |
| 3. Approvals, audit, staff | ❌ Mostly missing | ~1 / 6 |
| 4. Payments, check-in/out, dashboard | 🟡 Partial | ~2 / 10 |
| 5. Drivers | ❌ Missing | 0 / 5 |
| 6. Mechanics, incidents | 🟡 Partial | ~1 / 5 |

---

## Detailed matrix

Legend: ✅ done · 🟡 partial/equivalent · ❌ missing · N/A wrong stack

### Epic 1 — Foundation, auth, DevOps

| Requirement | Status | Reality / where |
|---|---|---|
| Initialise project | 🟡 | `backend` exists, but FastAPI + pip/venv, not Express |
| ESLint | ❌ | N/A for Python; no Ruff/Flake8 config either |
| Prettier | ❌ | no formatter config |
| Folder structure `services/models/routes/controllers/middleware/jobs/utils` | 🟡 | has `services/`, `models/`, `routers/`; no `controllers/`, `middleware/`, `jobs/`, `utils/` |
| Environment config + validated loader | ✅ | `app/core/config.py` (pydantic-settings) |
| `.env` + `.env.example`, never commit `.env` | ✅ | both exist; `.env` gitignored |
| Commit | 🟡 | git repo exists; no committed history for the backend yet |
| MongoDB Atlas replica set | ❌ | PostgreSQL (`asyncpg`); not Mongo |
| `/health` endpoint | ✅ | `app/routers/health.py`, runs `SELECT 1`, 200/503 |
| Centralised error handler | ❌ | FastAPI default error responses |
| Consistent `{ success, data, error }` shape | ❌ | routes return payloads directly |
| GitHub Actions lint + test on PR | ❌ | no `.github/` |
| Roles `owner, manager, agent, driver, mechanic` | 🟡 | has `admin, manager, agent, driver, mechanic, customer`; no `owner` |
| `register-owner` one-time seed | ❌ | only `scripts/seed_admin.py` (admin, not owner) |
| Login | ✅ | `POST /api/v1/auth/login` |
| Refresh token | ❌ | access JWT only |
| Logout | ❌ | no endpoint |
| `me` | ✅ | `GET /api/v1/auth/me` |
| RBAC middleware `requireRole` | ✅ | `require_role(*roles)` |
| Applied on every route | 🟡 | only on protected routes; public ones intentionally open |
| Rate limit login | ❌ | none |
| Helmet + CORS explicit origin list | ❌ | no CORS middleware (helmet is Node-only) |
| Seed one owner account | 🟡 | admin seed script only |

### Epic 2 — Bookings, pricing, holds

| Requirement | Status | Reality |
|---|---|---|
| Booking model | ✅ | `app/models/booking.py` |
| Statuses `Reserved, Confirmed, CheckedOut, Completed, Cancelled, Expired, Overdue` | 🟡 | only `reserved, confirmed, cancelled, completed` |
| `holdExpiresAt` | ✅ | `hold_expires_at`, 30 minutes |
| Overlap rule (`pickup/return ± buffer`, blocking statuses) | ❌ | no overlap check; only “vehicle is available” |
| Create inside a transaction (check + insert + commit) | 🟡 | uses `SELECT ... FOR UPDATE` in `db.begin()` instead of Mongo transaction; no date-overlap |
| `POST /quotes/calculate` pure endpoint | ❌ | no quote endpoint |
| Separate heavily unit-tested `pricingService` | 🟡 | pricing lives inside `booking_service.py`; only 2 pricing tests |
| `POST /bookings` creates hold | ✅ | `POST /api/v1/bookings` |
| BullMQ delayed expiry job | ❌ | no Redis/BullMQ; no expiry job |
| Every-minute sweeper safety net | ❌ | none |
| Collision-safe reference `BK-YYMM-####` | ❌ | uses UUID, no human reference |
| `pricingSnapshot` on booking | ❌ | only `total_kes` |

### Epic 3 — Approvals, audit, staff

| Requirement | Status | Reality |
|---|---|---|
| `PATCH /bookings/:id/approve-offline` | 🟡 | exists, but accepts no payment method/reference/reason |
| Immutable audit log (who/what/when/before/after) | ❌ | none |
| Extend hold while awaiting verification (configurable) | ❌ | fixed 30 min |
| Staff endpoints: create, list, change role, deactivate | ❌ | none |
| Deactivation invalidates refresh tokens | ❌ | no refresh tokens |
| Separation of duties (no self-approval) | ❌ | not checked |

### Epic 4 — Payments, check-out/in, dashboard

| Requirement | Status | Reality |
|---|---|---|
| Daraja OAuth + STK Push + callback | ✅ | `payment_service.py`, `routers/payments.py` |
| Payment model: checkoutRequestId, amount, phone, status, receipt, raw payload | 🟡 | has checkout ID, amount, status, receipt; **no phone**, **no raw callback payload** |
| Idempotent callback | 🟡 | re-processing overwrites status; no explicit “already completed → return” guard |
| Verify amount paid == amount due | ❌ | callback does not compare amount at all |
| Query-status fallback after 2 min | ❌ | none |
| Late-payment rule after hold expiry | ❌ | undefined |
| `POST /bookings/:id/check-out` and `/check-in` | ❌ | none |
| Fuel, odometer, photos, notes, signature | ❌ | none |
| Overdue detection job + late fee after 2h grace | ❌ | none |
| Excess mileage charge | ❌ | none |
| Dashboard aggregation endpoint | ❌ | none |

### Epic 5 — Drivers

| Requirement | Status | Reality |
|---|---|---|
| `DriverProfile` model | ❌ | none; `driver` exists only as a user role |
| `GET /drivers/available?from=&to=&vehicleId=` | ❌ | none |
| Dual vehicle + driver availability in booking transaction | ❌ | none |
| Licence class + PSV expiry validation | ❌ | none |
| `PATCH /bookings/:id/assign-driver` + SMS | ❌ | none |
| Driver fee, in-town/upcountry rate, reduced deposit | ❌ | only flat chauffeur fee KES 2,500/day |

### Epic 6 — Mechanics & incidents

| Requirement | Status | Reality |
|---|---|---|
| `MechanicPartner` with `2dsphere` index | 🟡 | `Mechanic` model exists; Postgres, no geo index |
| GeoJSON `[longitude, latitude]` | ❌ | plain `latitude`/`longitude` columns |
| `GET /mechanics/nearest` with `$nearSphere`, 50 km max | 🟡 | endpoint exists, uses Haversine in Python, **no 50 km cap** |
| `POST /incidents/breakdown` | ❌ | none |
| `PATCH /incidents/:id/dispatch` | ❌ | none |
| Real-time alert (polling 15s) | ❌ | none |
| Auto-block availability for workshop repair | ❌ | none |
| Flag affected upcoming bookings | ❌ | none |

---

## What actually exists today (the honest inventory)

**Working, tested:**
- Config validation, `.env` handling, health check with DB probe
- Argon2 passwords, HS256 JWT in HttpOnly cookie, timing-safe login, `require_role`
- User, Vehicle, Booking, Payment, Mechanic models
- Public vehicle list/detail
- Booking create with row lock, 30-min hold, integer pricing
- Offline approval (statuses only)
- Daraja STK push + callback (mocked in tests)
- Nearest mechanics (Haversine)
- 29 tests, all passing

**Not started:** refresh/logout, rate limiting, CORS, error envelope, CI/CD, queues, overlap rules, references, pricing snapshots, audit log, staff management, payment hardening, check-in/out, overdue/mileage, dashboard, drivers, incidents, frontend.

---

## Decision needed

The blueprint is written for **Express + MongoDB Atlas + Redis**. Picking one path now avoids doing everything twice:

**Option A — Keep FastAPI + PostgreSQL (recommended)**
- Keep the 29 passing tests and all current code.
- Build **functional equivalents**: Mongo transaction → SQL transaction + exclusion constraint/`FOR UPDATE`; BullMQ → APScheduler/Arq + a DB sweeper; `2dsphere` → PostGIS; Express middleware → FastAPI middleware; `{success,data,error}` → response models/exception handlers.
- Also requires renaming `admin`→`owner` (or adding `owner`) and adding refresh/logout.
- Fastest route to a production system.

**Option B — Follow the blueprint literally (Express/Mongo/Redis)**
- Treat the current FastAPI backend as a prototype, start a new `backend-node`.
- Everything in this audit becomes greenfield; very little code carries over.
- Better only if you specifically need the Node/Mongo ecosystem or team skills.

**Option C — Hybrid**
- Keep FastAPI/Postgres for the core and add only the missing business features, ignoring stack-specific instructions (BullMQ, 2dsphere, etc.).

> Reply with **A**, **B**, or **C**. If A/C, I'll turn this audit into a sequenced implementation plan (Epic 1 → 6) and start with the highest-risk items: payment amount verification + ownership, overlap/expiry, refresh tokens, and the missing Alembic migration.
