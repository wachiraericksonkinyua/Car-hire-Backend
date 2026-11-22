# Frontend Integration Guide — FastAPI ↔ React 19 + Vite

This document maps the completed **Gari Poa FastAPI backend** to the
React 19 + Vite frontend.

> **Current status**
> - The frontend is split into **two separate apps** in an npm workspace:
>   `frontend/apps/web` (customer, port 5173) and `frontend/apps/admin` (staff, port 5174),
>   sharing `frontend/packages/frontend`.
> - A **public customer API** now exists under `/api/v1/public`: catalogue,
>   vehicle detail, quotes, guest booking creation, booking lookup by
>   reference + phone, STK push, payment polling and nearest mechanics.
> - The **customer web pages are connected** to those public endpoints.
> - The **admin app is wired to the real staff API** through a response adapter
>   (`frontend/packages/frontend/src/api/backend.ts` and `queries.ts`): auth, dashboard, fleet,
>   bookings, approvals, handover, payments, drivers, mechanics, incidents,
>   staff and audit.
> - There are still **no customer accounts**. Guest lookup uses booking
>   reference + phone; this replaces “my bookings” login for now.
> - Remaining admin gaps: richer maintenance windows/search, photo galleries,
>   and some advanced booking transitions not exposed by the backend UI.

---

## 1. API Connection Blueprint

### 1.1 Base URL

| Environment | Value |
|---|---|
| Local | `http://localhost:8000` |
| All API routes | `http://localhost:8000/api/v1/...` |
| Health | `http://localhost:8000/health` |
| Swagger | `http://localhost:8000/docs` |

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The backend CORS allow-list comes from `CORS_ORIGINS` in `backend/.env`
(comma-separated). For Vite dev it is currently:

```env
CORS_ORIGINS=http://localhost:5173
```

CORS is configured with `allow_credentials=True`.

### 1.2 Auth model

- `POST /auth/login` returns a **15-minute access token in the JSON body**.
- Keep the access token **in memory only** (React state/context). Never
  `localStorage`/`sessionStorage`.
- A **refresh token** is set as an `HttpOnly`, `Secure`, `SameSite=lax`
  cookie scoped to `/api/v1/auth`.
- `POST /auth/refresh` rotates the refresh token and returns a new access token.
- `POST /auth/logout` revokes the refresh token and clears the cookie.
- `GET /auth/me` returns the current staff user.

Browser fetch:

```ts
fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // required for the refresh cookie
  body: JSON.stringify({ email, password }),
});
```

Axios:

```ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true, // required for the HttpOnly refresh cookie
});
```

`withCredentials` / `credentials: "include"` is only relevant on `localhost`
here because dev runs on ports 5173 → 8000. Ports do not change the site, but
the option is still required for the cookie handling to be explicit and for
cross-origin deployments.

The refresh cookie is `Secure`:
- works on `http://localhost` in modern browsers,
- will **not** work over plain HTTP on a LAN IP or custom domain,
- production must be HTTPS.

### 1.3 Authorization header

Every protected request:

```http
Authorization: Bearer <access_token>
```

No access token goes in a cookie. Do not use the refresh cookie as a Bearer
token.

### 1.4 Global 401 / refresh strategy (one retry)

Recommended flow:

1. Request fails with `401`.
2. If the request was **not** `/auth/login`, `/auth/refresh`, or `/auth/logout`,
   call `POST /auth/refresh` once with `withCredentials`.
3. On success, store the new access token and retry the original request once.
4. On failure, clear in-memory auth state and redirect to `/login`.
5. Never loop refreshes. Queue concurrent 401s and refresh once.

`403` means “authenticated but not allowed” — show a 403 page, do not log out.

`POST /auth/refresh` response shape:

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": {
      "id": "uuid",
      "email": "owner@autohire.ke",
      "full_name": "AutoHire Owner",
      "role": "owner",
      "is_active": true
    }
  },
  "error": null
}
```

On app boot, call `/auth/refresh` to restore a session, then `/auth/me` or use
the user in the refresh response.

### 1.5 Response envelope

Every route (success and error) uses:

```json
{ "success": true, "data": {}, "error": null }
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": [],
    "request_id": "..."
  }
}
```

API client should unwrap `data` and throw a typed error containing
`code`, `message`, `details`, and `request_id`.

Common codes:

| HTTP | `error.code` | Frontend behaviour |
|---|---|---|
| 401 | `unauthorized` | refresh once, then login |
| 403 | `forbidden` | 403 page / hide action |
| 404 | `not_found` | empty/not-found state |
| 409 | `conflict` | show conflict message (availability, hold expired, duplicate plate, etc.) |
| 422 | `validation_error` | map `details[].loc` to form fields |
| 429 | `rate_limited` | show retry message (login limit) |
| 502 | `bad_gateway` | M-Pesa/Safaricom failure |
| 503 | `service_unavailable` | health/DB unavailable |

Always display the `request_id` in error states and support logs.

### 1.6 Shared conventions

- Money: **integer KES**. `formatKes(12500)` → `KES 12,500`.
- Dates: API returns ISO strings, mostly UTC (`+00:00`). Convert to
  `Africa/Nairobi` for display; send UTC from the UI.
- IDs: UUID strings.
- Phone: send `2547XXXXXXXX` / `2541XXXXXXXX`. The backend also accepts
  `07XX` / `01XX` and normalises.
- Status enums are PascalCase:
  - Booking: `Reserved`, `Confirmed`, `CheckedOut`, `Overdue`, `Completed`,
    `Cancelled`, `Expired`
  - Vehicle: `Available`, `Reserved`, `Rented`, `Maintenance`
  - Payment: `Pending`, `Completed`, `Failed`, `Mismatched`
  - Incident: `Open`, `Dispatched`, `EnRoute`, `Resolved`
  - Driver: `Available`, `Assigned`, `OffDuty`
  - Trip: `Assigned`, `EnRoute`, `CustomerOnboard`, `Completed`
- API pagination shape: `{ items, total, limit, offset }`.
- Money/deposit: quote and booking totals include VAT and deposit.

---

## 2. Endpoint-to-Feature Map

### Public customer API (used by `frontend/apps/web`)

| Method | Endpoint | Feature / action |
|---|---|---|
| GET | `/api/v1/public/vehicles` | Customer catalogue with filters/pagination |
| GET | `/api/v1/public/vehicles/{id}` | Customer vehicle detail + 30-day ranges |
| POST | `/api/v1/public/quotes/calculate` | Guest quote breakdown |
| POST | `/api/v1/public/bookings` | Guest reservation (Reserved + 30-min hold) |
| GET | `/api/v1/public/bookings/{reference}?phone=` | Guest booking lookup |
| POST | `/api/v1/public/payments/stk-push` | Guest M-Pesa STK push |
| GET | `/api/v1/public/payments/{checkout_id}?reference=&phone=` | Guest payment polling |
| GET | `/api/v1/public/mechanics/nearest` | Public SOS mechanic lookup |

### Auth

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Staff login form | public |
| POST | `/api/v1/auth/refresh` | Restore/rotate session on boot or 401 | refresh cookie |
| POST | `/api/v1/auth/logout` | Logout button | refresh cookie |
| GET | `/api/v1/auth/me` | Current staff user / AuthContext | Bearer |

### Vehicles

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| GET | `/api/v1/vehicles` | Fleet list, landing catalogue, filters, availability | `vehicle:view` |
| GET | `/api/v1/vehicles/{id}` | Vehicle detail + 30-day booked ranges | `vehicle:view` |
| POST | `/api/v1/vehicles` | Add vehicle (staff) | `vehicle:manage` |
| PATCH | `/api/v1/vehicles/{id}` | Edit price/specs/status/insurance | `vehicle:manage` |

Vehicle list query: `from`, `to`, `category`, `transmission`, `fuel`, `seats`,
`brand`, `status`, `plate`, `available_only`, `limit`, `offset`.

### Quotes

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| POST | `/api/v1/quotes/calculate` | Price breakdown before booking | `booking:create` |

No database writes. Returns base days, chauffeur fee, extras, VAT, deposit,
total due.

### Bookings

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| GET | `/api/v1/bookings` | Booking list, approvals queue, timeline | `booking:view` |
| POST | `/api/v1/bookings` | Create Reserved booking + 30-min hold | `booking:create` |
| GET | `/api/v1/bookings/{id}` | Booking detail page | `booking:view` |
| PATCH | `/api/v1/bookings/{id}/approve-offline` | Approvals queue action | `booking:approve-standard` (+ corporate rule) |
| POST | `/api/v1/bookings/{id}/cancel` | Cancel booking | `booking:cancel` |
| PATCH | `/api/v1/bookings/{id}/assign-driver` | Assign/swap chauffeur | `booking:assign-driver` |
| POST | `/api/v1/bookings/{id}/check-out` | Handover form | `booking:checkout` |
| POST | `/api/v1/bookings/{id}/check-in` | Return form + settlement | `booking:checkin` |

Booking list query: `status`, `from`, `to`, `vehicle_id`, `payment_method`,
`search`, `pending_approval`, `limit`, `offset`.

### Payments (M-Pesa)

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| POST | `/api/v1/payments/stk-push` | “Pay with M-Pesa” button | `payment:initiate` |
| GET | `/api/v1/payments/{checkout_request_id}` | Payment status polling | `payment:initiate` |
| POST | `/api/v1/payments/mpesa/callback` | Safaricom webhook — **never call from frontend** | public |

STK request body:

```json
{ "booking_id": "uuid", "phone_number": "0712345678" }
```

Any client `amount` is ignored server-side; the booking total is charged.

Poll every ~3 seconds for up to ~2 minutes. Show:
`status`, `amount_due_kes`, `amount_paid_kes`, `amount_mismatch`,
`refund_required`, `mpesa_receipt`, `phone_masked`.

### Mechanics, incidents, drivers, staff, dashboard, audit

| Method | Endpoint | Feature / action | Auth |
|---|---|---|---|
| GET | `/api/v1/mechanics` | Mechanic directory / filters | `mechanic:view` |
| GET | `/api/v1/mechanics/nearest` | SOS nearest mechanics (≤50 km) | `mechanic:view` |
| POST | `/api/v1/mechanics` | Add mechanic | `mechanic:manage` |
| PATCH | `/api/v1/mechanics/{id}` | Edit mechanic / availability | `mechanic:manage` |
| GET | `/api/v1/incidents` | Breakdown board / SOS alerts | `incident:view` |
| POST | `/api/v1/incidents/breakdown` | Report breakdown | `incident:create` |
| PATCH | `/api/v1/incidents/{id}/dispatch` | Dispatch mechanic/rescue | `incident:dispatch` |
| PATCH | `/api/v1/incidents/{id}/resolve` | Resolve + release mechanic | `incident:dispatch` |
| GET | `/api/v1/drivers` | Driver roster | `driver:view` |
| POST | `/api/v1/drivers` | Create driver profile | `driver:manage` |
| PATCH | `/api/v1/drivers/{id}` | Edit licence/PSV/status | `driver:manage` |
| GET | `/api/v1/drivers/available` | Assignment dialog | `driver:view` |
| GET | `/api/v1/drivers/my-trips` | Driver mobile trip view | `trip:view-own` |
| PATCH | `/api/v1/drivers/my-trips/{booking_id}` | Trip status buttons | `trip:view-own` |
| GET | `/api/v1/staff` | Staff list | `staff:manage` |
| POST | `/api/v1/staff` | Invite/create staff | `staff:manage` |
| PATCH | `/api/v1/staff/{id}/role` | Change role | `staff:manage` |
| PATCH | `/api/v1/staff/{id}/status` | Deactivate/reactivate | `staff:manage` |
| GET | `/api/v1/dashboard` | Dashboard KPIs and today panels | `dashboard:view` |
| GET | `/api/v1/audit` | Audit log (read-only) | `audit:view` (owner) |
| GET | `/health` | Uptime/DB health | public |

### Role matrix for UI guards

| Capability | Owner | Manager | Agent | Driver | Mechanic |
|---|---|---|---|---|---|
| Dashboard / timeline | ✅ | ✅ | ✅ | — | — |
| Revenue | ✅ | ✅ | — | — | — |
| Vehicles view | ✅ | ✅ | ✅ | — | ✅ |
| Vehicles manage | ✅ | ✅ | — | — | — |
| Bookings view/list | ✅ | ✅ | ✅ | — | — |
| Create/cancel booking | ✅ | ✅ | ✅ | — | — |
| Approve standard | ✅ | ✅ | ✅ | — | — |
| Approve corporate | ✅ | ✅ | — | — | — |
| Check-out/in | ✅ | ✅ | ✅ | — | — |
| Assign driver | ✅ | ✅ | ✅ | — | — |
| Payments initiate/log | ✅ | ✅ | ✅ | — | — |
| Drivers view | ✅ | ✅ | ✅ | — | — |
| Mechanics view | ✅ | ✅ | ✅ | ✅ | — |
| Incidents view | ✅ | ✅ | ✅ | — | ✅ |
| Report breakdown | ✅ | ✅ | ✅ | ✅ | — |
| Dispatch mechanic | ✅ | ✅ | ✅ | — | — |
| Staff manage | ✅ | ✅ | — | — | — |
| Audit view | ✅ | — | — | — | — |
| Own trips only | — | — | — | ✅ | — |

The backend is the source of truth. Hide UI, but always handle 403.

---

## 3. Page-by-Page Requirements Checklist

### 3.1 Landing / Home Page

**Status: BLOCKED for anonymous customers.**

`GET /vehicles` requires a staff Bearer token. There is no public catalogue
endpoint yet. Use this page only inside the staff app until a public route is
added.

Required UI:
- Hero/search bar (plate or brand).
- Category chips: Economy, Compact SUV, 4x4, Minivan, Luxury.
- Filters: date range, transmission, fuel, seats, brand, status, available only.
- Vehicle grid/table toggle.
- Vehicle card: photo placeholder, brand/model, plate, seats/bags,
  transmission, daily rate in KES, dynamic status chip, insurance badge.
- Pagination with URL-synced query params.
- Loading skeletons, empty state, filtered-empty state, error + request ID.

Data:
- `GET /api/v1/vehicles?from&to&category&transmission&fuel&seats&brand&plate&available_only&limit&offset`.
- `data = { items, total, limit, offset }`.
- Status is dynamic for the selected window.
- **Photos are not available yet**; use placeholders.

State:
- TanStack Query with query keys including all filters.
- URL search params are the source of truth for shareable filters.

### 3.2 Vehicle Details Page

**Status: BLOCKED for anonymous customers.**

Required UI:
- Gallery (placeholder until photo API exists).
- Specs: brand, model, year, category, transmission, fuel, seats, bags,
  mileage cap, insurance expiry.
- Daily rate and refundable deposit in KES.
- Availability strip from `booked_ranges` (30 days).
- Chauffeur toggle (Self-drive / Chauffeur).
- Extras: baby seat, rooftop tent, cooler box, airport pickup.
- Quote preview (base, chauffeur, extras, VAT, deposit, total).
- “Book Now” CTA.

Data:
- `GET /api/v1/vehicles/{id}?from&to` → vehicle + `booked_ranges`.
- `POST /api/v1/quotes/calculate` on every change (debounce ~300ms).
- `insurance_expired: true` → disable booking and show “Cannot be booked”.
- `409` while reserving means the vehicle was just taken; refresh availability.

### 3.3 Checkout / Booking Modal

**Status: BLOCKED for anonymous customers.** `POST /bookings`,
`/quotes/calculate`, and `/payments/stk-push` all require staff auth.

Fields:
- Customer: name (required), phone (required), email (optional),
  ID type + ID number (optional).
- Pickup/return datetimes (UTC in request, EAT in picker).
- Pickup location.
- Drive mode: Self-drive / Chauffeur.
- Chauffeur zone: in-town / upcountry.
- Extras.
- Payment method: M-Pesa Online, M-Pesa Manual, Cash, Bank EFT, Corporate.

Flow:
1. Date/extras/mode change → `POST /quotes/calculate`.
2. Show itemised quote; deposit is separate and untaxed.
3. `POST /bookings` with customer fields + quote inputs.
4. Show `reference` and `hold_expires_at` countdown (30 min).
5. M-Pesa: `POST /payments/stk-push` `{booking_id, phone_number}`; poll
   `GET /payments/{checkout_request_id}`.
6. Offline methods: booking stays `Reserved`; owner/manager/agent approves it
   from the approvals queue.

Validation/errors:
- Return after pickup.
- Pickup not in the past.
- Phone `07XX`/`01XX` accepted.
- `409` → vehicle taken / hold expired.
- `422` → map detail `loc` to fields.
- `502` → Safaricom failure; offer retry.
- Never show “confirmed” until the API says so.
- Amount mismatch → show a flag and “staff review required”.

### 3.4 Customer Dashboard / My Bookings

**Status: BLOCKED.** There is no customer account model or customer login.
Bookings belong to staff (`created_by_id`) and store customer details inline.
`GET /bookings` is staff-scoped and returns **all** bookings, not “my
bookings”.

If built for staff instead, render:
- Active bookings (`Reserved`, `Confirmed`, `CheckedOut`, `Overdue`).
- Hold countdown.
- Payment status and receipt.
- Booking detail, cancel, pay, check-out/in links.
- Roadside SOS:
  - get browser geolocation,
  - `GET /mechanics/nearest?lat&lng` (staff/driver auth only),
  - map pins using `location.coordinates` = `[lng, lat]`,
  - convert to Leaflet `[lat, lng]` in exactly one helper,
  - show `distance_km` as approximate (straight line, max 50 km).

### 3.5 Staff / Admin Dashboard

Required routes/views:
- `/` Dashboard: KPIs, today’s pickups/returns, active breakdowns, revenue
  (owner/manager only), fleet status.
- `/timeline` Fleet timeline: `GET /bookings?from&to` + `GET /vehicles`.
- `/vehicles` list + filters; `/vehicles/new`, `/vehicles/:id/edit` (owner/manager).
- `/bookings` list/tabs: All, Reserved, Confirmed, CheckedOut, Overdue,
  Completed, Cancelled/Expired.
- `/bookings/new` walk-in wizard.
- `/bookings/:id` detail: customer, vehicle, quote snapshot, payments,
  driver, inspections, audit.
- `/approvals`: `GET /bookings?status=Reserved&pending_approval=true`; approve
  with mandatory payment method + reference; corporate requires reason and
  owner/manager; cannot approve own booking.
- `/bookings/:id/check-out` and `/check-in`: fuel, odometer, photos (URLs),
  notes, signature/confirmation, critical defect, settlement summary.
- `/drivers`: roster, availability, licence/PSV badges, assignment dialog.
- `/my-trips`: driver-only mobile layout + status buttons.
- `/mechanics`: map/list, county/type filters, add/edit (owner/manager).
- `/incidents`: active board, SOS report, dispatch, polling every 15s.
- `/staff`: list/create/role/status (owner/manager); manager cannot create owners.
- `/audit`: owner-only read-only table with filters and before/after.
- `/403` and `/login`.

State:
- TanStack Query; invalidate dashboard/bookings after mutations.
- Dashboard poll ~30–60s; incidents ~15s; payment ~3s until terminal.
- Debounced filters; server-side pagination.
- Confirm dialogs for cancel, dispatch, deactivate, corporate override.
- No optimistic updates for money, approvals, or availability.

Role guards:
- Wrap routes with a role/permission guard fed by `/auth/me`.
- Backend still enforces; handle 403.
- Hide revenue for agents.
- Hide audit for non-owners.

### 3.6 Login / Auth Pages

Required UI:
- Email, password, show/hide toggle.
- Submitting/loading state.
- Generic invalid-credentials message (401).
- Inactive account message (403).
- 429 rate-limit message with retry guidance.
- After login: store access token in memory, redirect to intended route.
- On boot: call `/auth/refresh`; if it fails → `/login`.
- Logout: clear memory, call `/auth/logout`, redirect.
- No customer registration/login page exists on the backend.

Auth endpoints:
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

---

## 4. Integration Gaps / Blockers

These must be resolved before the frontend can be fully public/customer-facing:

| Gap | Impact |
|---|---|
| ~~No public vehicle catalogue~~ | Implemented: `/api/v1/public/vehicles` |
| ~~No public booking/quote/payment endpoints~~ | Implemented under `/api/v1/public` |
| ~~No public mechanics endpoint~~ | Implemented: `/api/v1/public/mechanics/nearest` |
| No customer accounts | Guest lookup by reference + phone is implemented; no saved profile/history |
| Admin maintenance/search richness | Maintenance windows are empty; search covers bookings + vehicles |
| No vehicle photo upload/storage | Cards/details need placeholders |
| ~~No driver-profile API~~ | Implemented: `POST/PATCH /api/v1/drivers` |
| ~~No incident resolve endpoint~~ | Implemented: `PATCH /api/v1/incidents/{id}/resolve` releases the mechanic |
| No staff edit/password change | Profile/password screens limited |
| No payment list/refund workflow | Payments page limited to flags/polling |
| Later-phase pages absent | Customers/KYC, payments reconciliation, maintenance board, reports, settings |

---

## 5. Suggested Frontend State Model

```text
AuthContext
  user, role, accessToken (memory), isLoading
  login(email, password)
  logout()
  refresh()

ApiClient
  baseURL, withCredentials
  request interceptor -> Authorization Bearer
  response interceptor -> 401 refresh + one retry
  unwraps { success, data, error }
  throws ApiError { code, message, details, requestId }

Query keys
  vehicles(filters)
  vehicle(id, window)
  bookings(filters)
  booking(id)
  dashboard
  drivers
  mechanics
  incidents(filters)
  audit(filters)
```

Polling intervals:
- Payment: 3s, stop on `Completed`/`Failed`/`Mismatched`, max ~2 min.
- Dashboard: 30–60s.
- Incidents: 15s.
