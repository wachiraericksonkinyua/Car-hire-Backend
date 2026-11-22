# Gari Poa — Staff Admin

Staff back-office React 19 + Vite app for Gari Poa.

| Item | Value |
|---|---|
| Dev command (from `frontend/`) | `npm run dev:admin` |
| Dev URL | http://localhost:5174 |
| Build output | `apps/admin/dist` |
| API | Authenticated staff API under `/api/v1` |

The customer website lives in `../web`. Shared components, hooks, API
adapters and types live in `../../packages/frontend`.

## Setup

Install dependencies once from the `frontend/` folder (npm workspaces):

```bash
npm install
```

## Development

```bash
npm run dev:admin
```

Environment variables default to `.env.development`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Copy `.env.example` to `.env.local` to override locally.

## Demo logins

The Supabase database can be populated with the demo dataset:

```bash
cd ../api
source .venv/bin/activate
python -m scripts.seed_demo
```

All seeded accounts use `AutoHireDemo123!`.

| Role | Email |
|---|---|
| Owner | `amina@autohire.ke` |
| Manager | `brian@autohire.ke` |
| Agent | `wanjiku@autohire.ke` |
| Driver | `peter@autohire.ke` |
| Mechanic | `david@autohire.ke` |

## Build

```bash
npm run build:admin   # from `frontend/`
# or
npm run build         # inside apps/admin
```

Deploy the contents of `apps/admin/dist` to any static host. The admin app
can be hosted on its own domain or subdomain.

## Tests

```bash
npm run type-check
npm test                # shared unit tests, from `frontend/`
npm run test:e2e:admin  # Playwright
```

## Remaining gaps

See `../../../backend/FRONTEND_INTEGRATION.md`: vehicle photo galleries,
payment reconciliation/refunds, richer maintenance windows and reports.
