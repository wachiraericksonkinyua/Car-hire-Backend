# AutoHire KE — Frontend

React 19 + Vite frontend for AutoHire KE. The app builds two deployable
targets from one codebase:

| Target | Dev command | Port | Build output |
|---|---|---|---|
| Customer web | `npm run dev:web` | 5173 | `dist/web` |
| Staff admin | `npm run dev:admin` | 5174 | `dist/admin` |

## Setup

```bash
npm install
```

## Customer web

```bash
npm run dev:web
```

- Uses the public backend API (`/api/v1/public/...`) with **no mock service worker**.
- Set the API URL in `.env.web` (default `http://localhost:8000/api/v1`).
- Pages: home/catalogue, vehicle details, guest checkout, booking lookup.

## Staff admin

```bash
npm run dev:admin
```

- Runs on port 5174.
- MSW mocks are enabled by default in `.env.admin` while the admin API
  adapter is completed. Set `VITE_USE_MOCKS=false` to point it at the API.
- The admin backend contract differs in places from the current admin UI; see
  `../api/FRONTEND_INTEGRATION.md`.

## Builds

```bash
npm run build:web     # dist/web
npm run build:admin   # dist/admin
npm run preview:web
npm run preview:admin
```

Each build can be hosted independently (different domains/subdomains or
different static hosts).

## Tests

```bash
npm run type-check
npm run test
```
