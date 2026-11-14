export type UserRole = 'owner' | 'manager' | 'agent' | 'driver' | 'mechanic'
export type VehicleStatus = 'available' | 'booked' | 'maintenance' | 'inactive'
export type BookingStatus =
  | 'reserved'
  | 'confirmed'
  | 'checked_out'
  | 'expired'
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'overdue'
  | 'draft'

export type DriveMode = 'self_drive' | 'chauffeur'
export type PaymentMethod = 'mpesa_online' | 'mpesa_manual' | 'cash' | 'bank' | 'corporate'
export type DriverStatus = 'available' | 'assigned' | 'off_duty'
export type DriverTripStatus = 'en_route_to_pickup' | 'customer_onboard' | 'trip_completed'
export type DriverLocation = 'in_town' | 'upcountry'
export type MechanicType = 'in_house' | 'partner_garage' | 'towing'
export type IncidentCategory = 'flat_tyre' | 'battery' | 'overheating' | 'accident' | 'strange_noise'
export type IncidentStatus = 'open' | 'dispatching' | 'awaiting_replacement' | 'dispatched' | 'resolved'
export type IncidentDispatchType = 'closest_partner' | 'in_house_rescue' | 'replacement_vehicle'

export interface QuoteLineItem {
  code: string
  label: string
  amountKes: number
}

export interface PricingSnapshot {
  baseDays: number
  baseRateKes: number
  baseAmountKes: number
  chauffeurFeeKes: number
  driverLocation?: DriverLocation
  extras: QuoteLineItem[]
  vatRate: 16
  vatAmountKes: number
  totalDueKes: number
  refundableDepositKes: number
}

export interface QuoteRequest {
  vehicleId: string
  pickupAt: string
  returnAt: string
  pickupLocation: string
  mode: DriveMode
  driverLocation?: DriverLocation
  extras: string[]
}

export interface QuoteResponse {
  pricingSnapshot: PricingSnapshot
  currency: 'KES'
}

export interface BookingPayment {
  id: string
  method: PaymentMethod
  amountKes: number
  status: 'pending' | 'paid' | 'failed'
  reference: string
  createdAt: string
}

export interface BookingEvent {
  id: string
  type: string
  actor: string
  note: string
  createdAt: string
}

export interface BookingInspection {
  id: string
  type: 'check_out' | 'check_in'
  odometer: number
  fuelLevel: string
  createdAt: string
  notes?: string
  photos?: string[]
  signatureConfirmed?: boolean
  criticalDefect?: boolean
}

export interface HandoverRequest {
  odometer: number
  fuelLevel: string
  notes: string
  photos: string[]
  signatureConfirmed: boolean
  criticalDefect: boolean
  completedAt: string
}

export interface HandoverSettlement {
  graceHours: number
  lateHours: number
  lateFeeKes: number
  odometerDifferenceKm: number
  includedMileageKm: number
  excessMileageKm: number
  excessMileageRateKes: number
  excessMileageChargeKes: number
  totalKes: number
}

export interface StkInitiation {
  paymentId: string
  maskedPhone: string
}

export interface StkStatus {
  outcome: 'pending' | 'confirmed' | 'failed' | 'manual_refund'
  amountDueKes: number
  paidAmountKes?: number
  message?: string
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  branch?: string
  active?: boolean
  lastLogin?: string
}

export interface Driver extends User {
  role: 'driver'
  status: DriverStatus
  languages: string[]
  licenceClass: string
  licenceExpiresAt: string
  psvExpiresAt: string
  rating: number
  currentTrip?: { bookingId: string; reference: string; pickupAt: string }
}

export interface AvailableDriversResponse {
  drivers: Driver[]
  autoAssignDriverId: string | null
}

export interface StaffMember extends User {
  branch: string
  active: boolean
  lastLogin: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  entity: string
  createdAt: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface Vehicle {
  id: string
  make: string
  model: string
  category?: string
  year: number
  registration: string
  seats: number
  transmission: 'automatic' | 'manual'
  ratePerDay: number
  status: VehicleStatus
}

export interface MaintenanceWindow {
  id: string
  vehicleId: string
  startAt: string
  endAt: string
  reason: string
}

export interface Mechanic {
  id: string
  name: string
  phone: string
  whatsapp: string
  county: string
  town: string
  type: MechanicType
  specialties: string[]
  callOutRateKes: number
  location: { type: 'Point'; coordinates: [longitude: number, latitude: number] }
}

export interface Booking {
  id: string
  reference: string
  vehicleId: string
  customerId: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  customerIdNumber?: string
  status: BookingStatus
  pendingApproval?: boolean
  pickupAt: string
  returnAt: string
  totalKes: number
  mode?: DriveMode
  paymentMethod?: PaymentMethod
  holdExpiresAt?: string
  createdById?: string
  pricingSnapshot?: PricingSnapshot
  payments?: BookingPayment[]
  events?: BookingEvent[]
  driver?: User
  vehicleRegistration?: string
  driverTripStatus?: DriverTripStatus
  inspections?: BookingInspection[]
  auditEntries?: BookingEvent[]
  accruedLateFeeKes?: number
}

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: { code?: string; message: string }
}

export interface AuthSession {
  accessToken: string
  user: User
}

export interface HealthStatus {
  status: 'ok'
}

export type DashboardCardKey =
  | 'vehiclesOutToday'
  | 'pickupsDueToday'
  | 'returnsDueToday'
  | 'overdueVehicles'
  | 'pendingApprovals'
  | 'activeBreakdowns'
  | 'monthlyRevenue'

export interface DashboardActivity {
  id: string
  kind: 'booking' | 'handover' | 'incident'
  reference: string
  timestamp: string
}

export interface DashboardData {
  metrics: Record<DashboardCardKey, number | null>
  cardErrors?: Partial<Record<DashboardCardKey, string>>
  pickups: Booking[]
  returns: Booking[]
  fleetStatus: { available: number; rented: number; reserved: number; maintenance: number }
  recentActivity: DashboardActivity[]
}

export interface Incident {
  id: string
  reference: string
  status: IncidentStatus
  description: string
  createdAt: string
  category: IncidentCategory
  location: { type: 'Point'; coordinates: [longitude: number, latitude: number] }
  locationText: string
  vehicleId?: string
  immobilising: boolean
  photos: string[]
  source: 'driver' | 'customer' | 'desk'
  dispatch?: { type: IncidentDispatchType; mechanicId?: string; vehicleId?: string; createdAt: string }
}

export interface IncidentCreateRequest {
  category: IncidentCategory
  description: string
  location: Incident['location']
  locationText: string
  vehicleId?: string
  immobilising: boolean
  photos: string[]
  source: Incident['source']
}

export type MechanicCreateRequest = Omit<Mechanic, 'id'>

export interface NearbyMechanic extends Mechanic {
  distanceKm: number
}

export interface NotificationCounts {
  pendingApprovals: number
  openIncidents: number
}

export interface SearchResult {
  id: string
  type: 'vehicle' | 'booking' | 'customer'
  title: string
  subtitle: string
  href: string
}

export interface BookingCreateRequest extends QuoteRequest {
  customerName: string
  customerPhone: string
  customerEmail: string
  customerIdNumber: string
  paymentMethod: PaymentMethod
  createdById: string
}