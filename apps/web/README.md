# AutoHire KE — Customer Web

Customer-facing React 19 + Vite app for AutoHire KE.

| Item | Value |
|---|---|
| Dev command (from repo root) | `npm run dev:web` |
| Dev URL | http://localhost:5173 |
| Build output | `apps/web/dist` |
| API | Public API under `/api/v1/public` |

The staff back-office lives in `../admin`. Shared components, hooks, API
adapters and types live in `../../packages/frontend`.

## Setup

Install dependencies once from the repository root (npm workspaces):

```bash
npm install
```

## Development

```bash
npm run dev:web
```

Environment variables default to `.env.development`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Copy `.env.example` to `.env.local` to override locally.

## Pages

- home / catalogue
- vehicle details
- guest checkout
- booking lookup by reference + phone
- payment (STK) status polling
- nearest mechanics

## Build

```bash
npm run build:web     # from repo root
# or
npm run build         # inside apps/web
```

Deploy the contents of `apps/web/dist` to any static host.

## Tests

```bash
npm run type-check
npm test              # shared unit tests, from repo root
npm run test:e2e:web  # Playwright
```
