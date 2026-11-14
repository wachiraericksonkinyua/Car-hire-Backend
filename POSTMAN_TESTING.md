# Postman Testing Guide — AutoHire KE Backend

The API runs locally against Supabase; Postman talks to
`http://localhost:8000`. The local PostgreSQL cluster is only for pytest.

---

## 1. Start the API

```bash
cd ~/car-hire/apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Check:

```bash
curl -s http://localhost:8000/health
```

Swagger UI: <http://localhost:8000/docs>

---

## 2. Postman setup

Create an environment:

| Variable | Value |
|---|---|
| `base_url` | `http://localhost:8000` |
| `token` | (empty; set after login) |
| `agent_token` | (empty) |
| `owner_token` | (empty) |
| `driver_token` | (empty) |
| `vehicle_id` | (empty) |
| `booking_id` | (empty) |
| `driver_profile_id` | (empty) |
| `mechanic_id` | (empty) |

Auth header for protected requests:

```
Authorization: Bearer {{token}}
```

Enable Postman's **cookie jar** so the HttpOnly refresh token is stored for
`/api/v1/auth`.

The seeded owner (Supabase):

```
email:    owner@autohire.ke
password: Autohire-Dev-2026!
```

---

## 3. Login

`POST {{base_url}}/api/v1/auth/login`

```json
{
  "email": "owner@autohire.ke",
  "password": "Autohire-Dev-2026!"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": { "...": "..." }
  },
  "error": null
}
```

Copy `access_token` into `owner_token` (and `token`).

Do **not** use the refresh cookie as an access token. Access is always the
Bearer token.

Other auth routes:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/auth/me` | Bearer |
| POST | `/api/v1/auth/refresh` | cookie only |
| POST | `/api/v1/auth/logout` | cookie only |

Login is rate-limited (5 attempts / 5 minutes per IP+email).

---

## 4. Create test data

### 4.1 Agent and driver staff users

`POST {{base_url}}/api/v1/staff` with the **owner** token.

Agent:

```json
{
  "email": "agent@autohire.ke",
  "full_name": "Test Agent",
  "phone": "0712345678",
  "role": "agent",
  "password": "StrongPass123"
}
```

Driver user:

```json
{
  "email": "driver1@autohire.ke",
  "full_name": "Driver One",
  "phone": "0722000001",
  "role": "driver",
  "password": "StrongPass123"
}
```

Login as the agent and save `agent_token`; login as the driver and save
`driver_token`.

### 4.2 Driver profile (temporary SQL step)

There is **no driver-profile API yet**. In the Supabase SQL editor:

```sql
INSERT INTO driver_profiles
  (id, user_id, licence_class, licence_expiry, psv_expiry, status, created_at)
VALUES
  (gen_random_uuid(),
   '<driver-user-uuid>',
   'D1',
   '2030-01-01',
   '2030-01-01',
   'Available',
   now())
RETURNING id;
```

Save the returned id as `driver_profile_id`.

### 4.3 Vehicle

`POST {{base_url}}/api/v1/vehicles` with the **owner** token.

```json
{
  "plate_number": "KDA 123A",
  "brand": "Toyota",
  "model": "Landcruiser",
  "year": 2022,
  "category": "SUV",
  "transmission": "Automatic",
  "fuel": "Diesel",
  "seats": 5,
  "bags": 3,
  "daily_rate_kes": 10000,
  "deposit_kes": 20000,
  "mileage_cap_km": 300,
  "insurance_expiry": "2030-01-01"
}
```

Save `id` as `vehicle_id`.

### 4.4 Mechanic

`POST {{base_url}}/api/v1/mechanics` with the owner token.

```json
{
  "name": "Partner Garage",
  "garage": "Partner Garage Ltd",
  "phone": "0733000001",
  "whatsapp": "0733000001",
  "county": "Nairobi",
  "town": "Westlands",
  "mechanic_type": "PartnerGarage",
  "specialties": ["Tyres", "Battery"],
  "call_out_rate_kes": 2000,
  "latitude": -1.267,
  "longitude": 36.803
}
```

Save `id` as `mechanic_id`.

---

## 5. Quote and booking

### 5.1 Quote

`POST {{base_url}}/api/v1/quotes/calculate` with the **agent** token.

```json
{
  "vehicle_id": "{{vehicle_id}}",
  "pickup_at": "2026-12-01T09:00:00Z",
  "return_at": "2026-12-05T09:00:00Z",
  "with_chauffeur": true,
  "chauffeur_zone": "in_town",
  "extras": ["baby_seat", "airport_pickup"]
}
```

This performs no writes.

### 5.2 Create booking (as agent)

`POST {{base_url}}/api/v1/bookings` with the **agent** token.

```json
{
  "vehicle_id": "{{vehicle_id}}",
  "pickup_at": "2026-12-01T09:00:00Z",
  "return_at": "2026-12-05T09:00:00Z",
  "customer_name": "Jane Customer",
  "customer_phone": "0712345678",
  "customer_email": "jane@example.com",
  "customer_id_type": "national_id",
  "customer_id_number": "12345678",
  "pickup_location": "JKIA Terminal 1A",
  "with_chauffeur": true,
  "chauffeur_zone": "in_town",
  "extras": ["baby_seat"]
}
```

Save `id` as `booking_id` and note the `reference` (`BK-YYMM-####`).

**Separation of duties:** the agent must create the booking; the owner can
approve it. An owner cannot approve a booking they created.

---

## 6. Test the full lifecycle

### 6.1 Approve offline (owner)

`PATCH {{base_url}}/api/v1/bookings/{{booking_id}}/approve-offline`

```json
{
  "payment_method": "Cash",
  "payment_reference": "RC-1001"
}
```

For `"Corporate Credit"`, a `reason` is required and only owner/manager can do it.

### 6.2 Assign driver

`PATCH {{base_url}}/api/v1/bookings/{{booking_id}}/assign-driver`

```json
{ "driver_id": "{{driver_profile_id}}" }
```

The booking must be `Confirmed`, chauffeur, and the driver licence/PSV must be
valid.

### 6.3 Driver trip view

`GET {{base_url}}/api/v1/drivers/my-trips` with `driver_token`.

Update trip status:

`PATCH {{base_url}}/api/v1/drivers/my-trips/{{booking_id}}`

```json
{ "status": "EnRoute" }
```

Allowed sequence: `Assigned → EnRoute → CustomerOnboard → Completed`.

### 6.4 Check-out (agent/owner)

`POST {{base_url}}/api/v1/bookings/{{booking_id}}/check-out`

```json
{
  "fuel_percent": 100,
  "odometer_km": 1000,
  "photos": ["https://example.com/front.jpg"],
  "notes": "Clean",
  "signature": "signed-by-customer",
  "confirmation": true,
  "critical_defect": false
}
```

### 6.5 Check-in

`POST {{base_url}}/api/v1/bookings/{{booking_id}}/check-in`

```json
{
  "fuel_percent": 90,
  "odometer_km": 1500,
  "photos": ["https://example.com/return.jpg"],
  "notes": "Minor scratch",
  "confirmation": true,
  "critical_defect": true
}
```

Critical defect → vehicle becomes `Maintenance`.

---

## 7. Read/query endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/api/v1/vehicles?from=&to=&status=&available_only=` | owner/manager/agent/mechanic |
| GET | `/api/v1/vehicles/{id}` | same |
| GET | `/api/v1/bookings?status=&pending_approval=true&search=` | owner/manager/agent |
| GET | `/api/v1/bookings/{id}` | same |
| GET | `/api/v1/dashboard` | owner/manager/agent |
| GET | `/api/v1/audit` | owner |
| GET | `/api/v1/drivers` | owner/manager/agent |
| GET | `/api/v1/drivers/available?from=&to=&vehicle_id=` | owner/manager/agent |
| GET | `/api/v1/mechanics` | owner/manager/agent/driver |
| GET | `/api/v1/mechanics/nearest?lat=&lng=` | same |
| GET | `/api/v1/incidents?active_only=true` | owner/manager/agent/mechanic |
| GET | `/api/v1/staff` | owner/manager |

---

## 8. Incidents

`POST {{base_url}}/api/v1/incidents/breakdown`

```json
{
  "vehicle_id": "{{vehicle_id}}",
  "booking_id": "{{booking_id}}",
  "category": "Accident",
  "description": "Broken windscreen",
  "latitude": -1.29,
  "longitude": 36.82,
  "requires_workshop": false
}
```

Dispatch:

`PATCH {{base_url}}/api/v1/incidents/<incident-uuid>/dispatch`

```json
{
  "dispatch_type": "PartnerMechanic",
  "mechanic_id": "{{mechanic_id}}"
}
```

Dispatching makes the partner mechanic unavailable; restore with
`PATCH /api/v1/mechanics/{id}` → `{"is_available": true}`.

If `requires_workshop: true`, the vehicle becomes `Maintenance` and upcoming
booking IDs are returned in `affected_booking_ids`.

---

## 9. Testing M-Pesa without Daraja

Without `MPESA_*` credentials, `POST /payments/stk-push` returns 502.
To test the callback flow, insert a pending payment in Supabase SQL:

```sql
INSERT INTO payments
  (id, booking_id, amount_kes, amount_due_kes, amount_mismatch,
   phone, checkout_request_id, status, refund_required, created_at)
VALUES
  (gen_random_uuid(),
   '<reserved-booking-uuid>',
   70320,  -- this example booking's total_kes (chauffeur + baby seat)
   70320,
   false,
   '254712345678',
   'ws_CO_TEST_123',
   'Pending',
   false,
   now());
```

Then:

`POST {{base_url}}/api/v1/payments/mpesa/callback`

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "merchant-1",
      "CheckoutRequestID": "ws_CO_TEST_123",
      "ResultCode": 0,
      "ResultDesc": "success",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 70320 },
          { "Name": "MpesaReceiptNumber", "Value": "QK123ABC" }
        ]
      }
    }
  }
}
```

Poll with `GET /api/v1/payments/ws_CO_TEST_123`.

---

## 10. What is not testable through Postman yet

- Creating/editing **DriverProfile** rows (SQL workaround above).
- Vehicle/inspection **file uploads** (photos are URL lists).
- Incident **resolve** endpoint (no route yet).
- Staff **edit name/phone/password** (only create/role/status).
- Real M-Pesa STK push without Daraja credentials.
- Full audit before/after for booking creation and STK initiation (not yet written).
