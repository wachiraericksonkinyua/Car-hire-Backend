# API (reserved)

This folder is reserved for the backend (Node/Express or FastAPI).

The frontend in `apps/web` currently uses local mock data from
`src/data/`, so the API can be added later without blocking UI work.

Suggested next steps:

- `npm init -y` and add Express/Fastify, or create a FastAPI project here.
- Expose `/api/vehicles`, `/api/bookings`, `/api/posts`, `/api/contact`.
- Point the frontend at `VITE_API_URL` and replace the imports in `src/data/`.
