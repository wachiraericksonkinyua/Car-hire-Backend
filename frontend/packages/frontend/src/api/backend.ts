import type {
  Booking,
  DashboardData,
  Driver,
  Incident,
  Mechanic,
  NearbyMechanic,
  PaymentMethod,
  PricingSnapshot,
  QuoteRequest,
  QuoteResponse,
  Vehicle,
} from './types'

export interface BackendVehicle {
  id: string
  plate_number: string
  brand: string
  model: string
  year: number
  category: string
  transmission: string
  fuel: string
  seats: number
  bags: number
  daily_rate_kes: number
  deposit_kes: number
  mileage_cap_km: number
  insurance_expiry: string
  status: string
  photos?: { id: string; url: string; caption: string | null; sort_order: number }[]
}

export interface BackendBooking {
  id: string
  reference: string
  vehicle_id: string
  created_by_id?: string | null
  driver_id?: string | null
  trip_status?: string | null
  customer_name?: string
  customer_phone?: string
  customer_email?: string | null
  customer_id_number?: string | null
  pickup_at: string
  return_at: string
  total_kes: number
  status: string
  hold_expires_at?: string
  with_chauffeur?: boolean
  pricing_snapshot?: Record<string, unknown> | null
  payment_method?: string | null
  vehicle?: { id: string; plate_number: string; brand: string; model: string }
  vehicle_plate?: string
  vehicle_model?: string
  created_by?: { id: string; full_name: string } | null
  inspections?: {
    id: string
    kind: string
    fuel_percent: number
    odometer_km: number
    photos: string[] | null
    notes: string | null
    signature: string | null
    confirmation: boolean
    critical_defect: boolean
    created_at: string
  }[]
}

export interface BackendDriver {
  id: string
  user_id: string
  full_name: string
  phone: string | null
  licence_class: string
  licence_expiry: string
  psv_expiry: string
  status: string
  languages: string[] | null
  rating: number | null
  photo_url: string | null
  licence_expired: boolean
  psv_expired: boolean
}

export interface BackendMechanic {
  id: string
  name: string
  garage: string | null
  phone: string
  whatsapp: string | null
  county: string
  town: string | null
  mechanic_type: string | null
  specialties: string[] | null
  call_out_rate_kes: number | null
  location: { type: 'Point'; coordinates: [number, number] }
  is_available: boolean
  distance_km?: number | null
  created_at: string
}

export interface BackendIncident {
  id: string
  vehicle_id: string
  vehicle_plate: string
  booking_id: string | null
  booking_reference: string | null
  category: string
  description: string | null
  location: { type: 'Point'; coordinates: [number, number] }
  status: string
  dispatch_type: string | null
  requires_workshop: boolean
  mechanic_id: string | null
  mechanic_name: string | null
  affected_booking_ids: string[] | null
  created_at: string
  resolved_at: string | null
}

export interface BackendQuote {
  vehicle_id: string
  daily_rate_kes: number
  days: number
  base_rental_kes: number
  chauffeur_zone: string | null
  chauffeur_days: number
  chauffeur_rate_kes: number
  chauffeur_fee_kes: number
  extras: { code: string; label: string; quantity: number; unit_rate_kes: number; amount_kes: number; taxable: boolean }[]
  taxable_subtotal_kes: number
  vat_percent: number
  vat_kes: number
  deposit_kes: number
  total_due_kes: number
}

const bookingStatusMap: Record<string, Booking['status']> = {
  Reserved: 'reserved',
  Confirmed: 'confirmed',
  CheckedOut: 'checked_out',
  Overdue: 'overdue',
  Completed: 'completed',
  Cancelled: 'cancelled',
  Expired: 'expired',
}

const paymentMethodMap: Record<string, PaymentMethod> = {
  Cash: 'cash',
  'Bank EFT': 'bank',
  'Corporate Credit': 'corporate',
  'M-Pesa Manual': 'mpesa_manual',
}

const driverStatusMap: Record<string, Driver['status']> = {
  Available: 'available',
  Assigned: 'assigned',
  OffDuty: 'off_duty',
}

const driverTripStatusMap: Record<string, 'en_route_to_pickup' | 'customer_onboard' | 'trip_completed'> = {
  EnRoute: 'en_route_to_pickup',
  CustomerOnboard: 'customer_onboard',
  Completed: 'trip_completed',
}

export function mapVehicle(vehicle: BackendVehicle): Vehicle {
  return {
    id: vehicle.id,
    make: vehicle.brand,
    model: vehicle.model,
    category: vehicle.category,
    year: vehicle.year,
    registration: vehicle.plate_number,
    seats: vehicle.seats,
    bags: vehicle.bags,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission.toLowerCase() === 'manual' ? 'manual' : 'automatic',
    ratePerDay: vehicle.daily_rate_kes,
    depositKes: vehicle.deposit_kes,
    mileageCapKm: vehicle.mileage_cap_km,
    insuranceExpiry: vehicle.insurance_expiry,
    status: vehicle.status === 'Maintenance' ? 'maintenance' : vehicle.status === 'Available' ? 'available' : 'booked',
    photos: (vehicle.photos ?? []).map((photo) => ({ id: photo.id, url: photo.url, caption: photo.caption ?? undefined })),
  }
}

function fuelLevelLabel(percent: number): string {
  if (percent >= 100) return 'full'
  if (percent >= 75) return 'three_quarters'
  if (percent >= 50) return 'half'
  if (percent >= 25) return 'quarter'
  return 'empty'
}

export function mapBooking(booking: BackendBooking): Booking {
  const snapshot = booking.pricing_snapshot
  return {
    id: booking.id,
    reference: booking.reference,
    vehicleId: booking.vehicle_id,
    customerId: booking.customer_id_number ?? '',
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    customerEmail: booking.customer_email ?? undefined,
    customerIdNumber: booking.customer_id_number ?? undefined,
    status: bookingStatusMap[booking.status] ?? 'reserved',
    pendingApproval: booking.status === 'Reserved' && !booking.payment_method,
    pickupAt: booking.pickup_at,
    returnAt: booking.return_at,
    totalKes: booking.total_kes,
    mode: booking.with_chauffeur ? 'chauffeur' : 'self_drive',
    paymentMethod: booking.payment_method ? paymentMethodMap[booking.payment_method] : undefined,
    holdExpiresAt: booking.hold_expires_at,
    createdById: booking.created_by_id ?? undefined,
    pricingSnapshot: snapshot ? mapPricingSnapshot(snapshot) : undefined,
    vehicleRegistration: booking.vehicle?.plate_number ?? booking.vehicle_plate,
    driverTripStatus: booking.trip_status ? driverTripStatusMap[booking.trip_status] : undefined,
    inspections: (booking.inspections ?? []).map((inspection) => ({
      id: inspection.id,
      type: inspection.kind === 'CheckOut' ? 'check_out' : 'check_in',
      odometer: inspection.odometer_km,
      fuelLevel: fuelLevelLabel(inspection.fuel_percent),
      createdAt: inspection.created_at,
      notes: inspection.notes ?? undefined,
      photos: inspection.photos ?? undefined,
      signatureConfirmed: inspection.confirmation,
      criticalDefect: inspection.critical_defect,
    })),
  }
}

function mapPricingSnapshot(snapshot: Record<string, unknown>): PricingSnapshot {
  const extras = Array.isArray(snapshot.extras) ? snapshot.extras as { code?: string; label?: string; amount_kes?: number }[] : []
  return {
    baseDays: Number(snapshot.days ?? 0),
    baseRateKes: Number(snapshot.daily_rate_kes ?? 0),
    baseAmountKes: Number(snapshot.base_rental_kes ?? snapshot.daily_rate_kes ?? 0),
    chauffeurFeeKes: Number(snapshot.chauffeur_fee_kes ?? 0),
    driverLocation: snapshot.chauffeur_zone === 'upcountry' ? 'upcountry' : snapshot.chauffeur_zone ? 'in_town' : undefined,
    extras: extras.map((extra) => ({ code: extra.code ?? '', label: extra.label ?? '', amountKes: Number(extra.amount_kes ?? 0) })),
    vatRate: 16,
    vatAmountKes: Number(snapshot.vat_kes ?? 0),
    totalDueKes: Number(snapshot.total_kes ?? snapshot.total_due_kes ?? 0),
    refundableDepositKes: Number(snapshot.deposit_kes ?? 0),
  }
}

export function mapDriver(driver: BackendDriver): Driver {
  return {
    id: driver.id,
    userId: driver.user_id,
    name: driver.full_name,
    email: '',
    phone: driver.phone ?? '',
    role: 'driver',
    active: true,
    status: driverStatusMap[driver.status] ?? 'available',
    languages: driver.languages ?? [],
    licenceClass: driver.licence_class,
    licenceExpiresAt: driver.licence_expiry,
    psvExpiresAt: driver.psv_expiry,
    rating: driver.rating ?? 0,
    photoUrl: driver.photo_url ?? undefined,
  }
}

const mechanicTypeMap: Record<string, Mechanic['type']> = {
  InHouse: 'in_house',
  PartnerGarage: 'partner_garage',
  Towing: 'towing',
}

export function mapMechanic(mechanic: BackendMechanic): Mechanic {
  return {
    id: mechanic.id,
    name: mechanic.name,
    phone: mechanic.phone,
    whatsapp: mechanic.whatsapp ?? '',
    county: mechanic.county,
    town: mechanic.town ?? '',
    type: mechanic.mechanic_type ? mechanicTypeMap[mechanic.mechanic_type] ?? 'partner_garage' : 'partner_garage',
    specialties: mechanic.specialties ?? [],
    callOutRateKes: mechanic.call_out_rate_kes ?? 0,
    location: mechanic.location,
  }
}

export function mapNearbyMechanic(mechanic: BackendMechanic): NearbyMechanic {
  return { ...mapMechanic(mechanic), distanceKm: mechanic.distance_km ?? 0 }
}

const incidentStatusMap: Record<string, Incident['status']> = {
  Open: 'open',
  Dispatched: 'dispatched',
  EnRoute: 'dispatching',
  Resolved: 'resolved',
}

const dispatchTypeMap: Record<string, 'closest_partner' | 'in_house_rescue' | 'replacement_vehicle'> = {
  PartnerMechanic: 'closest_partner',
  InHouseRescue: 'in_house_rescue',
  ReplacementVehicle: 'replacement_vehicle',
}

export function mapIncident(incident: BackendIncident): Incident {
  return {
    id: incident.id,
    reference: incident.booking_reference ?? incident.id.slice(0, 8),
    status: incidentStatusMap[incident.status] ?? 'open',
    description: incident.description ?? '',
    createdAt: incident.created_at,
    category: (incident.category.toLowerCase().replace(/\s+/g, '_') as Incident['category']),
    location: incident.location,
    locationText: '',
    vehicleId: incident.vehicle_id,
    immobilising: incident.requires_workshop,
    photos: [],
    source: 'desk',
    dispatch: incident.dispatch_type
      ? {
          type: dispatchTypeMap[incident.dispatch_type] ?? 'closest_partner',
          mechanicId: incident.mechanic_id ?? undefined,
          createdAt: incident.created_at,
        }
      : undefined,
  }
}

export function mapQuote(quote: BackendQuote): QuoteResponse {
  return {
    currency: 'KES',
    pricingSnapshot: {
      baseDays: quote.days,
      baseRateKes: quote.daily_rate_kes,
      baseAmountKes: quote.base_rental_kes,
      chauffeurFeeKes: quote.chauffeur_fee_kes,
      driverLocation: quote.chauffeur_zone === 'upcountry' ? 'upcountry' : quote.chauffeur_zone ? 'in_town' : undefined,
      extras: quote.extras.map((extra) => ({ code: extra.code, label: extra.label, amountKes: extra.amount_kes })),
      vatRate: 16,
      vatAmountKes: quote.vat_kes,
      totalDueKes: quote.total_due_kes,
      refundableDepositKes: quote.deposit_kes,
    },
  }
}

export function toBackendBooking(input: QuoteRequest & {
  customerName: string
  customerPhone: string
  customerEmail: string
  customerIdNumber: string
  paymentMethod: PaymentMethod
}) {
  return {
    vehicle_id: input.vehicleId,
    pickup_at: input.pickupAt,
    return_at: input.returnAt,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    customer_email: input.customerEmail || null,
    customer_id_type: input.customerIdNumber ? 'national_id' : null,
    customer_id_number: input.customerIdNumber || null,
    pickup_location: input.pickupLocation || null,
    with_chauffeur: input.mode === 'chauffeur',
    chauffeur_zone: input.mode === 'chauffeur' ? input.driverLocation ?? 'in_town' : undefined,
    extras: input.extras,
  }
}

export function mapDashboard(data: {
  kpis: {
    vehicles_out_today: number
    pickups_due_today: number
    returns_due_today: number
    overdue: number
    pending_approvals: number
    active_breakdowns: number
    monthly_revenue_kes: number | null
    fleet_status: { available: number; reserved: number; rented: number; maintenance: number }
  }
  pickups_today: { id: string; reference: string; customer_name: string; vehicle_plate: string; pickup_at: string; return_at: string; status: string }[]
  returns_today: { id: string; reference: string; customer_name: string; vehicle_plate: string; pickup_at: string; return_at: string; status: string }[]
  recent_activity: { action: string; entity: string; entity_id: string | null; created_at: string }[]
}): DashboardData {
  const brief = (item: { id: string; reference: string; customer_name: string; vehicle_plate: string; pickup_at: string; return_at: string; status: string }): Booking => ({
    id: item.id,
    reference: item.reference,
    vehicleId: '',
    customerId: '',
    customerName: item.customer_name,
    status: bookingStatusMap[item.status] ?? 'reserved',
    pickupAt: item.pickup_at,
    returnAt: item.return_at,
    totalKes: 0,
    vehicleRegistration: item.vehicle_plate,
  })
  return {
    metrics: {
      vehiclesOutToday: data.kpis.vehicles_out_today,
      pickupsDueToday: data.kpis.pickups_due_today,
      returnsDueToday: data.kpis.returns_due_today,
      overdueVehicles: data.kpis.overdue,
      pendingApprovals: data.kpis.pending_approvals,
      activeBreakdowns: data.kpis.active_breakdowns,
      monthlyRevenue: data.kpis.monthly_revenue_kes,
    },
    pickups: data.pickups_today.map(brief),
    returns: data.returns_today.map(brief),
    fleetStatus: data.kpis.fleet_status,
    recentActivity: data.recent_activity.map((item) => ({
      id: `${item.action}-${item.created_at}`,
      kind: item.entity === 'incident' ? 'incident' : item.entity === 'payment' ? 'handover' : 'booking',
      reference: item.entity_id ?? item.action,
      timestamp: item.created_at,
    })),
  }
}
