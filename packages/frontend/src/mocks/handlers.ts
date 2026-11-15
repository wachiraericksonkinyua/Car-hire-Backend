import { http, HttpResponse } from 'msw'
import { bookings, DEMO_PASSWORD, drivers, incidents, mechanics, maintenanceWindows, users, vehicles } from './fixtures'
import { buildDashboardData, getPendingApprovalCount, searchFixtures } from '../features/dashboard/dashboardData'
import type { Booking, BookingCreateRequest, DriverTripStatus, HandoverRequest, HandoverSettlement, PaymentMethod, QuoteRequest, QuoteResponse, StkInitiation, StkStatus, Vehicle } from '../api/types'
import { getDriverEligibilityReason } from '../features/drivers/driverRules'
import type { Incident, IncidentCreateRequest, IncidentDispatchType, Mechanic, MechanicCreateRequest } from '../api/types'
import { getNearestMechanics } from '../features/incidents/incidentGeo'
import { toGeoJson, toLeaflet } from '../lib/geo'

let networkAttempts = 0
const bookingStore: Booking[] = [...bookings]
const incidentStore: Incident[] = [...incidents]
const mechanicStore: Mechanic[] = [...mechanics]
const stkAttempts = new Map<string, { bookingId: string; phone: string; amountKes: number; polls: number; createdAt: number }>()
let driverRotationIndex = 0

const blockingStatuses = new Set(['reserved', 'confirmed', 'checked_out', 'overdue'])

function overlaps(booking: Booking, pickupAt: string, returnAt: string) {
  return blockingStatuses.has(booking.status) && booking.pickupAt < returnAt && booking.returnAt > pickupAt
}

function isVehicleAvailable(vehicleId: string, pickupAt: string, returnAt: string) {
  const vehicle = vehicles.find((item) => item.id === vehicleId)
  return Boolean(vehicle && !['maintenance', 'inactive'].includes(vehicle.status) && !bookingStore.some((booking) => booking.vehicleId === vehicleId && overlaps(booking, pickupAt, returnAt)))
}

function categoryForVehicle(vehicle: Vehicle) {
  if (vehicle.seats >= 8) return 'Van'
  if (['Prado TX', 'X-Trail', 'RAV4', 'Forester', 'Land Cruiser V8', 'CX-5'].includes(vehicle.model)) return 'SUV'
  return 'Sedan'
}

function calculateMockQuote(body: QuoteRequest, ratePerDay: number): QuoteResponse {
  const milliseconds = Date.parse(body.returnAt) - Date.parse(body.pickupAt)
  const baseDays = Math.max(1, Math.ceil(milliseconds / 86_400_000))
  const baseAmountKes = ratePerDay * baseDays
  const driverLocation = body.driverLocation ?? 'in_town'
  const chauffeurFeeKes = body.mode === 'chauffeur' ? (driverLocation === 'upcountry' ? 6500 : 3500) * baseDays : 0
  const extraPrices: Record<string, { label: string; amountKes: number; perDay: boolean }> = {
    baby_seat: { label: 'Baby seat', amountKes: 500, perDay: true },
    rooftop_tent: { label: 'Rooftop tent', amountKes: 1800, perDay: true },
    cooler_box: { label: 'Cooler box', amountKes: 700, perDay: true },
    airport_pickup: { label: 'Airport pickup', amountKes: 2500, perDay: false },
  }
  const extras = body.extras.flatMap((code) => {
    const item = extraPrices[code]
    return item ? [{ code, label: item.label, amountKes: item.amountKes * (item.perDay ? baseDays : 1) }] : []
  })
  const taxable = baseAmountKes + chauffeurFeeKes + extras.reduce((sum, item) => sum + item.amountKes, 0)
  const vatAmountKes = Math.round(taxable * 0.16)
  return {
    currency: 'KES',
    pricingSnapshot: { baseDays, baseRateKes: ratePerDay, baseAmountKes, chauffeurFeeKes, driverLocation, extras, vatRate: 16, vatAmountKes, totalDueKes: taxable + vatAmountKes, refundableDepositKes: 15000 },
  }
}

function currentDriver(request: Request) {
  const role = request.headers.get('authorization')?.replace('Bearer mock-', '')
  const user = users.find((item) => item.role === role)
  return user?.role === 'driver' ? user : undefined
}

function overlapsDriverTrip(driverId: string, from: string, to: string, excludingBookingId?: string) {
  return bookingStore.some((booking) => booking.id !== excludingBookingId
    && booking.driver?.id === driverId
    && blockingStatuses.has(booking.status)
    && booking.pickupAt < to
    && booking.returnAt > from)
}

export const handlers = [
  http.get('/api/v1/health', () =>
    HttpResponse.json({ success: true, data: { status: 'ok' }, error: null }),
  ),
  http.get('/api/v1/vehicles', ({ request }) => {
    const url = new URL(request.url)
    const pickupAt = url.searchParams.get('from') ?? ''
    const returnAt = url.searchParams.get('to') ?? ''
    const available = pickupAt && returnAt
      ? vehicles.filter((vehicle) => isVehicleAvailable(vehicle.id, pickupAt, returnAt))
      : vehicles
    return HttpResponse.json({ success: true, data: available.map((vehicle) => ({ ...vehicle, category: categoryForVehicle(vehicle) })), error: null })
  }),
  http.get('/api/v1/maintenance-windows', ({ request }) => {
    const url = new URL(request.url)
    const from = Date.parse(url.searchParams.get('from') ?? '')
    const to = Date.parse(url.searchParams.get('to') ?? '')
    const rows = maintenanceWindows.filter((window) => Date.parse(window.startAt) < to && Date.parse(window.endAt) > from)
    return HttpResponse.json({ success: true, data: rows, error: null })
  }),
  http.get('/api/v1/mechanics/nearest', ({ request }) => {
    const url = new URL(request.url)
    const latitude = Number(url.searchParams.get('lat'))
    const longitude = Number(url.searchParams.get('lng'))
    const radiusKm = Number(url.searchParams.get('radiusKm') ?? 50)
    const limit = Number(url.searchParams.get('limit') ?? 5)
    const category = url.searchParams.get('category') ?? undefined
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_LOCATION', message: 'A valid map location is required' } }, { status: 400 })
    const location = toGeoJson([latitude, longitude])
    const candidates = category ? mechanicStore.filter((mechanic) => mechanic.specialties.includes(category)) : mechanicStore
    return HttpResponse.json({ success: true, data: getNearestMechanics(candidates, { location }, radiusKm, limit), error: null })
  }),
  http.get('/api/v1/mechanics', () => HttpResponse.json({ success: true, data: mechanicStore, error: null })),
  http.post('/api/v1/mechanics', async ({ request }) => {
    const body = await request.json() as MechanicCreateRequest
    const coordinates = toLeaflet(body.location)
    const mechanic: Mechanic = {
      ...body,
      id: `mech-${String(mechanicStore.length + 1).padStart(2, '0')}`,
      location: toGeoJson(coordinates),
    }
    mechanicStore.push(mechanic)
    return HttpResponse.json({ success: true, data: mechanic, error: null }, { status: 201 })
  }),
  http.get('/api/v1/incidents', () => HttpResponse.json({ success: true, data: [...incidentStore].sort((left, right) => right.createdAt.localeCompare(left.createdAt)), error: null })),
  http.post('/api/v1/incidents/breakdown', async ({ request }) => {
    const body = await request.json() as IncidentCreateRequest
    const coordinates = toLeaflet(body.location)
    const createdAt = new Date().toISOString()
    const nextReference = `SOS-${String(100 + incidentStore.length + 1).padStart(3, '0')}`
    const incident: Incident = {
      ...body,
      location: toGeoJson(coordinates),
      id: `inc-${String(incidentStore.length + 1).padStart(2, '0')}`,
      reference: nextReference,
      status: 'open',
      createdAt,
    }
    incidentStore.unshift(incident)
    return HttpResponse.json({ success: true, data: incident, error: null }, { status: 201 })
  }),
  http.patch('/api/v1/incidents/:id/dispatch', async ({ params, request }) => {
    const index = incidentStore.findIndex((incident) => incident.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Incident not found' } }, { status: 404 })
    const body = await request.json() as { type: IncidentDispatchType; mechanicId?: string; vehicleId?: string }
    const current = incidentStore[index]
    let mechanicId = body.mechanicId
    if (body.type === 'closest_partner') {
      const partnerCandidates = mechanicStore.filter((mechanic) => mechanic.type === 'partner_garage')
      const nearest = getNearestMechanics(partnerCandidates, current, 50, 1)[0]
      if (!nearest) return HttpResponse.json({ success: false, data: null, error: { code: 'NO_PARTNER_WITHIN_RANGE', message: 'No partner mechanic is available within 50 km' } }, { status: 409 })
      mechanicId = nearest.id
    }
    if (body.type === 'in_house_rescue' && !mechanicId) {
      mechanicId = getNearestMechanics(mechanicStore.filter((mechanic) => mechanic.type === 'in_house'), current, 50, 1)[0]?.id
    }
    if (body.type === 'replacement_vehicle' && !body.vehicleId) return HttpResponse.json({ success: false, data: null, error: { code: 'VEHICLE_REQUIRED', message: 'Select a replacement vehicle' } }, { status: 400 })
    const updated: Incident = {
      ...current,
      status: body.type === 'replacement_vehicle' ? 'awaiting_replacement' : 'dispatched',
      dispatch: { type: body.type, mechanicId, vehicleId: body.vehicleId, createdAt: new Date().toISOString() },
    }
    incidentStore[index] = updated
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.get('/api/v1/drivers', () => HttpResponse.json({ success: true, data: drivers, error: null })),
  http.get('/api/v1/drivers/available', ({ request }) => {
    const url = new URL(request.url)
    const from = url.searchParams.get('from') ?? ''
    const to = url.searchParams.get('to') ?? ''
    const vehicleId = url.searchParams.get('vehicleId') ?? ''
    const vehicle = vehicles.find((item) => item.id === vehicleId)
    if (!from || !to || !vehicle) return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_QUERY', message: 'A vehicle and trip window are required' } }, { status: 400 })
    const valid = drivers.filter((driver) => !getDriverEligibilityReason(driver, to)
      && (vehicle.seats <= 8 || driver.licenceClass === 'C1')
      && !overlapsDriverTrip(driver.id, from, to))
    const autoAssignDriverId = valid.length ? valid[driverRotationIndex % valid.length].id : null
    return HttpResponse.json({ success: true, data: { drivers: valid, autoAssignDriverId }, error: null })
  }),
  http.get('/api/v1/drivers/me/trips', ({ request }) => {
    const driver = currentDriver(request)
    if (!driver) return HttpResponse.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Driver access required' } }, { status: 403 })
    const trips = bookingStore.filter((booking) => booking.driver?.id === driver.id && ['confirmed', 'active', 'checked_out', 'overdue', 'completed'].includes(booking.status))
      .map((booking) => ({ ...booking, vehicleRegistration: vehicles.find((vehicle) => vehicle.id === booking.vehicleId)?.registration }))
    return HttpResponse.json({ success: true, data: trips, error: null })
  }),
  http.get('/api/v1/bookings', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const paymentMethod = url.searchParams.get('paymentMethod')
    const vehicleId = url.searchParams.get('vehicleId')
    const search = (url.searchParams.get('search') ?? '').toLocaleLowerCase()
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const pickup = url.searchParams.get('pickup')
    const returning = url.searchParams.get('return')
    const today = new Date().toISOString().slice(0, 10)
    let rows = [...bookingStore]
    if (status === 'active') rows = rows.filter((booking) => booking.status === 'checked_out')
    else if (status) rows = rows.filter((booking) => booking.status === status || (status === 'cancelled' && booking.status === 'expired'))
    if (paymentMethod) rows = rows.filter((booking) => booking.paymentMethod === paymentMethod)
    if (vehicleId) rows = rows.filter((booking) => booking.vehicleId === vehicleId)
    if (search) rows = rows.filter((booking) => `${booking.reference} ${booking.customerName ?? ''}`.toLocaleLowerCase().includes(search))
    if (from) rows = rows.filter((booking) => Date.parse(booking.returnAt) >= Date.parse(from))
    if (to) rows = rows.filter((booking) => Date.parse(booking.pickupAt) <= Date.parse(to))
    if (pickup === 'due-today') rows = rows.filter((booking) => booking.status === 'confirmed' && booking.pickupAt.slice(0, 10) === today)
    if (returning === 'due-today') rows = rows.filter((booking) => ['checked_out', 'overdue'].includes(booking.status) && booking.returnAt.slice(0, 10) === today)
    return HttpResponse.json({ success: true, data: rows, error: null })
  }),
  http.get('/api/v1/bookings/:id', ({ params }) => {
    const booking = bookingStore.find((item) => item.id === params.id)
    if (!booking) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    return HttpResponse.json({ success: true, data: booking, error: null })
  }),
  http.post('/api/v1/bookings/:id/driver', async ({ params, request }) => {
    const index = bookingStore.findIndex((booking) => booking.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const body = await request.json() as { driverId: string }
    const booking = bookingStore[index]
    const driver = drivers.find((item) => item.id === body.driverId)
    const vehicle = vehicles.find((item) => item.id === booking.vehicleId)
    if (!driver || !vehicle || getDriverEligibilityReason(driver, booking.returnAt)
      || (vehicle.seats > 8 && driver.licenceClass !== 'C1')
      || overlapsDriverTrip(body.driverId, booking.pickupAt, booking.returnAt, booking.id)) {
      return HttpResponse.json({ success: false, data: null, error: { code: 'DRIVER_UNAVAILABLE', message: 'This driver is no longer available for the selected trip window.' } }, { status: 409 })
    }
    const updated = { ...booking, driver }
    bookingStore[index] = updated
    driver.status = 'assigned'
    driver.currentTrip = { bookingId: booking.id, reference: booking.reference, pickupAt: booking.pickupAt }
    driverRotationIndex += 1
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.post('/api/v1/bookings/:id/driver-status', async ({ params, request }) => {
    const index = bookingStore.findIndex((booking) => booking.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Trip not found' } }, { status: 404 })
    const driverUser = currentDriver(request)
    const booking = bookingStore[index]
    if (!driverUser || booking.driver?.id !== driverUser.id) return HttpResponse.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You can only update your own trips' } }, { status: 403 })
    const body = await request.json() as { status: DriverTripStatus }
    const expectedPrevious: Record<DriverTripStatus, DriverTripStatus | undefined> = {
      en_route_to_pickup: undefined,
      customer_onboard: 'en_route_to_pickup',
      trip_completed: 'customer_onboard',
    }
    if (booking.driverTripStatus !== expectedPrevious[body.status]) return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_TRIP_STATUS', message: 'Trip status must advance in order.' } }, { status: 409 })
    const updated: Booking = { ...booking, driverTripStatus: body.status, ...(body.status === 'trip_completed' ? { status: 'completed' } : {}) }
    bookingStore[index] = updated
    if (body.status === 'trip_completed') {
      const driver = drivers.find((item) => item.id === driverUser.id)
      if (driver) { driver.status = 'available'; driver.currentTrip = undefined }
    }
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.post('/api/v1/bookings/:id/inspections/photos', async ({ params, request }) => {
    const booking = bookingStore.find((item) => item.id === params.id)
    if (!booking) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_FILE', message: 'A photo is required' } }, { status: 400 })
    return HttpResponse.json({ success: true, data: { url: `/mock-uploads/${booking.id}/${encodeURIComponent(file.name)}` }, error: null }, { status: 201 })
  }),
  http.post('/api/v1/bookings/:id/check-out', async ({ params, request }) => {
    const index = bookingStore.findIndex((item) => item.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const body = await request.json() as HandoverRequest
    const booking = bookingStore[index]
    if (booking.status !== 'confirmed') return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_STATUS', message: 'Only confirmed bookings can be checked out' } }, { status: 409 })
    if (!Number.isFinite(body.odometer) || body.odometer < 0 || !body.fuelLevel || !body.signatureConfirmed) {
      return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_INSPECTION', message: 'Odometer, fuel level and confirmation are required' } }, { status: 400 })
    }
    const inspection = { ...body, id: `inspection-${Date.now()}`, type: 'check_out' as const, createdAt: body.completedAt }
    const updated = { ...booking, status: 'checked_out' as const, inspections: [...(booking.inspections ?? []), inspection], events: [...(booking.events ?? []), { id: `event-${Date.now()}`, type: 'checked_out', actor: 'Staff', note: body.notes || 'Vehicle checked out', createdAt: body.completedAt }] }
    bookingStore[index] = updated
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.post('/api/v1/bookings/:id/check-in/settlement', async ({ params, request }) => {
    const booking = bookingStore.find((item) => item.id === params.id)
    if (!booking) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const checkOut = booking.inspections?.find((inspection) => inspection.type === 'check_out')
    const body = await request.json() as { odometer: number; completedAt: string }
    if (!checkOut) return HttpResponse.json({ success: false, data: null, error: { code: 'CHECK_OUT_REQUIRED', message: 'A check-out inspection is required first' } }, { status: 409 })
    if (!Number.isFinite(body.odometer) || body.odometer < checkOut.odometer) {
      return HttpResponse.json({ success: false, data: null, error: { code: 'ODOMETER_INVALID', message: 'Check-in odometer must be at least the check-out reading' } }, { status: 400 })
    }
    const graceHours = 2
    const lateHours = Math.max(0, Math.ceil((Date.parse(body.completedAt) - Date.parse(booking.returnAt) - graceHours * 60 * 60 * 1000) / (60 * 60 * 1000)))
    const lateFeeKes = lateHours * 1500
    const odometerDifferenceKm = body.odometer - checkOut.odometer
    const includedMileageKm = (booking.pricingSnapshot?.baseDays ?? 1) * 100
    const excessMileageKm = Math.max(0, odometerDifferenceKm - includedMileageKm)
    const excessMileageRateKes = 50
    const settlement: HandoverSettlement = {
      graceHours, lateHours, lateFeeKes, odometerDifferenceKm, includedMileageKm,
      excessMileageKm, excessMileageRateKes, excessMileageChargeKes: excessMileageKm * excessMileageRateKes,
      totalKes: lateFeeKes + excessMileageKm * excessMileageRateKes,
    }
    return HttpResponse.json({ success: true, data: settlement, error: null })
  }),
  http.post('/api/v1/bookings/:id/check-in', async ({ params, request }) => {
    const index = bookingStore.findIndex((item) => item.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const body = await request.json() as HandoverRequest
    const booking = bookingStore[index]
    const checkOut = booking.inspections?.find((inspection) => inspection.type === 'check_out')
    if (!checkOut) return HttpResponse.json({ success: false, data: null, error: { code: 'CHECK_OUT_REQUIRED', message: 'A check-out inspection is required first' } }, { status: 409 })
    if (body.odometer < checkOut.odometer) return HttpResponse.json({ success: false, data: null, error: { code: 'ODOMETER_INVALID', message: 'Check-in odometer must be at least the check-out reading' } }, { status: 400 })
    if (!body.signatureConfirmed) return HttpResponse.json({ success: false, data: null, error: { code: 'CONFIRMATION_REQUIRED', message: 'Check-in confirmation is required' } }, { status: 400 })
    const inspection = { ...body, id: `inspection-${Date.now()}`, type: 'check_in' as const, createdAt: body.completedAt }
    const updated = { ...booking, status: 'completed' as const, inspections: [...(booking.inspections ?? []), inspection], events: [...(booking.events ?? []), { id: `event-${Date.now()}`, type: 'checked_in', actor: 'Staff', note: body.notes || 'Vehicle checked in', createdAt: body.completedAt }] }
    bookingStore[index] = updated
    const vehicle = vehicles.find((item) => item.id === booking.vehicleId)
    if (vehicle) vehicle.status = body.criticalDefect ? 'maintenance' : 'available'
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.post('/api/v1/bookings/:id/payments/stk', async ({ params, request }) => {
    const booking = bookingStore.find((item) => item.id === params.id)
    if (!booking) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const body = await request.json() as { phone: string; amountKes: number }
    if (!/^254[17]\d{8}$/.test(body.phone)) return HttpResponse.json({ success: false, data: null, error: { code: 'INVALID_PHONE', message: 'Enter a valid Kenyan mobile number' } }, { status: 400 })
    const paymentId = `stk-${Date.now()}`
    stkAttempts.set(paymentId, { bookingId: booking.id, phone: body.phone, amountKes: body.amountKes, polls: 0, createdAt: Date.now() })
    const maskedPhone = `${body.phone.slice(0, 4)}XX XXX ${body.phone.slice(-3)}`
    const result: StkInitiation = { paymentId, maskedPhone }
    return HttpResponse.json({ success: true, data: result, error: null }, { status: 201 })
  }),
  http.get('/api/v1/payments/:paymentId/status', ({ params }) => {
    const attempt = stkAttempts.get(String(params.paymentId))
    if (!attempt) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Payment attempt not found' } }, { status: 404 })
    attempt.polls += 1
    const booking = bookingStore.find((item) => item.id === attempt.bookingId)!
    const finalDigit = attempt.phone.at(-1)
    let outcome: StkStatus['outcome'] = 'pending'
    let paidAmountKes: number | undefined
    let message: string | undefined
    const isLate = Boolean(booking.holdExpiresAt && Date.parse(booking.holdExpiresAt) <= Date.now())
    if (finalDigit === '0') outcome = 'pending'
    else if (attempt.polls >= 1 && finalDigit === '2') { outcome = 'failed'; message = 'The payment was not completed.' }
    else if (attempt.polls >= 1 && isLate && finalDigit !== '1') { outcome = 'manual_refund'; message = 'Late payment flagged for manual refund.' }
    else if (attempt.polls >= 1) {
      outcome = 'confirmed'
      paidAmountKes = finalDigit === '8' ? Math.max(0, attempt.amountKes - 100) : attempt.amountKes
      if (booking) bookingStore[bookingStore.findIndex((item) => item.id === booking.id)] = { ...booking, status: 'confirmed', pendingApproval: false }
    }
    const result: StkStatus = { outcome, amountDueKes: booking.totalKes, paidAmountKes, message }
    return HttpResponse.json({ success: true, data: result, error: null })
  }),
  http.post('/api/v1/quotes/calculate', async ({ request }) => {
    const body = await request.json() as QuoteRequest
    const vehicle = vehicles.find((item) => item.id === body.vehicleId)
    if (!vehicle) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } }, { status: 404 })
    return HttpResponse.json({
      success: true,
      data: calculateMockQuote(body, vehicle.ratePerDay),
      error: null,
    })
  }),
  http.post('/api/v1/bookings', async ({ request }) => {
    const body = await request.json() as BookingCreateRequest
    if (!isVehicleAvailable(body.vehicleId, body.pickupAt, body.returnAt)) {
      return HttpResponse.json({ success: false, data: null, error: { code: 'VEHICLE_UNAVAILABLE', message: 'This car was just booked for those dates' } }, { status: 409 })
    }
    const vehicle = vehicles.find((item) => item.id === body.vehicleId)!
    const quote = calculateMockQuote(body, vehicle.ratePerDay)
    const bookingIndex = bookingStore.length + 1
    const createdAt = new Date().toISOString()
    const paymentMethod: PaymentMethod = body.paymentMethod
    const booking: Booking = {
      id: `booking-${String(bookingIndex).padStart(2, '0')}`,
      reference: `BK-${createdAt.slice(2, 7).replace('-', '')}-${String(bookingIndex).padStart(4, '0')}`,
      vehicleId: body.vehicleId,
      customerId: `cus-new-${bookingIndex}`,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      customerIdNumber: body.customerIdNumber,
      status: 'reserved',
      pendingApproval: paymentMethod !== 'mpesa_online',
      mode: body.mode,
      paymentMethod,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      createdById: body.createdById,
      pickupAt: body.pickupAt,
      returnAt: body.returnAt,
      totalKes: quote.pricingSnapshot.totalDueKes,
      pricingSnapshot: quote.pricingSnapshot,
      payments: [],
      events: [{ id: `evt-new-${bookingIndex}`, type: 'created', actor: body.createdById, note: 'Booking reserved', createdAt }],
      driver: body.mode === 'chauffeur' ? users.find((item) => item.role === 'driver') : undefined,
      inspections: [],
      auditEntries: [{ id: `audit-new-${bookingIndex}`, type: 'booking.reserved', actor: body.createdById, note: 'Booking created from wizard', createdAt }],
    }
    bookingStore.unshift(booking)
    return HttpResponse.json({ success: true, data: booking, error: null }, { status: 201 })
  }),
  http.patch('/api/v1/bookings/:id', async ({ params, request }) => {
    const index = bookingStore.findIndex((item) => item.id === params.id)
    if (index < 0) return HttpResponse.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, { status: 404 })
    const patch = await request.json() as Partial<Booking>
    const current = bookingStore[index]
    if (current.status === 'reserved' && current.holdExpiresAt && Date.parse(current.holdExpiresAt) <= Date.now() && patch.status === 'confirmed') {
      return HttpResponse.json({ success: false, data: null, error: { code: 'HOLD_EXPIRED', message: 'The booking hold has expired' } }, { status: 409 })
    }
    const updated: Booking = {
      ...current,
      ...patch,
      events: [...(current.events ?? []), { id: `evt-${Date.now()}`, type: `status.${patch.status ?? 'updated'}`, actor: 'Staff', note: 'Booking updated', createdAt: new Date().toISOString() }],
    }
    bookingStore[index] = updated
    return HttpResponse.json({ success: true, data: updated, error: null })
  }),
  http.get('/api/v1/dashboard', ({ request }) => {
    const url = new URL(request.url)
    const failedCard = url.searchParams.get('fail')
    const data = buildDashboardData()
    return HttpResponse.json({
      success: true,
      data: failedCard ? { ...data, cardErrors: { [failedCard]: 'Could not load this metric' } } : data,
      error: null,
    })
  }),
  http.get('/api/v1/notifications', () => HttpResponse.json({
    success: true,
    data: { pendingApprovals: getPendingApprovalCount(), openIncidents: incidentStore.filter((incident) => incident.status === 'open').length },
    error: null,
  })),
  http.get('/api/v1/search', ({ request }) => {
    const query = new URL(request.url).searchParams.get('q') ?? ''
    return HttpResponse.json({ success: true, data: searchFixtures(query), error: null })
  }),
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    if (body.email === 'rate-limited@autohire.ke') {
      return HttpResponse.json(
        { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
    if (body.email === 'deactivated@autohire.ke') {
      return HttpResponse.json(
        { success: false, data: null, error: { code: 'ACCOUNT_DEACTIVATED', message: 'This account has been deactivated' } },
        { status: 403 },
      )
    }
    if (body.email === 'network-error@autohire.ke' && networkAttempts++ === 0) {
      return HttpResponse.error()
    }

    const user = body.email === 'network-error@autohire.ke'
      ? users.find((item) => item.role === 'agent')
      : users.find((item) => item.email === body.email)
    if (!user || body.password !== DEMO_PASSWORD) {
      return HttpResponse.json(
        { success: false, data: null, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 },
      )
    }
    return HttpResponse.json(
      { success: true, data: { accessToken: `mock-${user.role}`, user }, error: null },
      { headers: { 'Set-Cookie': `autohire_refresh=mock-${user.role}; HttpOnly; SameSite=Lax; Path=/` } },
    )
  }),
  http.post('/api/v1/auth/refresh', ({ cookies }) => {
    const refreshRole = cookies.autohire_refresh?.match(/^mock-(owner|manager|agent|driver|mechanic)$/)?.[1]
    if (!refreshRole) {
      return HttpResponse.json(
        { success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      )
    }
    return HttpResponse.json({ success: true, data: { accessToken: `mock-${refreshRole}` }, error: null })
  }),
  http.post('/api/v1/auth/logout', () =>
    HttpResponse.json(
      { success: true, data: { loggedOut: true }, error: null },
      { headers: { 'Set-Cookie': 'autohire_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } },
    ),
  ),
  http.get('/api/v1/auth/me', ({ request }) => {
    const role = request.headers.get('authorization')?.replace('Bearer mock-', '')
    const user = users.find((item) => item.role === role)
    if (!user) {
      return HttpResponse.json(
        { success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      )
    }
    return HttpResponse.json({ success: true, data: user, error: null })
  }),
]