import type { Booking, BookingStatus, Driver, Incident, MaintenanceWindow, Mechanic, User, Vehicle } from '../api/types'

export const DEMO_PASSWORD = 'AutoHireDemo123!'

export const users: User[] = [
  { id: 'usr-01', name: 'Amina Njeri', email: 'amina@autohire.ke', phone: '254712345601', role: 'owner', branch: 'Nairobi HQ', active: true, lastLogin: '2026-11-14T07:40:00.000Z' },
  { id: 'usr-02', name: 'Brian Otieno', email: 'brian@autohire.ke', phone: '254712345602', role: 'manager', branch: 'Mombasa Branch', active: true, lastLogin: '2026-11-14T08:05:00.000Z' },
  { id: 'usr-03', name: 'Wanjiku Kamau', email: 'wanjiku@autohire.ke', phone: '254712345603', role: 'agent', branch: 'Nairobi West', active: true, lastLogin: '2026-11-14T06:55:00.000Z' },
  { id: 'usr-04', name: 'Peter Mwangi', email: 'peter@autohire.ke', phone: '254112345604', role: 'driver', branch: 'Nairobi HQ', active: true, lastLogin: '2026-11-13T18:00:00.000Z' },
  { id: 'usr-05', name: 'David Kiptoo', email: 'david@autohire.ke', phone: '254112345605', role: 'mechanic', branch: 'Nairobi HQ', active: true, lastLogin: '2026-11-14T05:15:00.000Z' },
]

export const drivers: Driver[] = [
  { ...users[3], role: 'driver', status: 'assigned', languages: ['English', 'Kiswahili'], licenceClass: 'B', licenceExpiresAt: '2027-11-14T00:00:00.000Z', psvExpiresAt: '2027-11-14T00:00:00.000Z', rating: 4.8, currentTrip: { bookingId: 'booking-07', reference: 'BK-2611-0007', pickupAt: '2026-11-07T06:00:00.000Z' } },
  { id: 'drv-02', name: 'Grace Wanjiru', email: 'grace.driver@autohire.ke', phone: '254712345620', role: 'driver', status: 'assigned', languages: ['English', 'Kiswahili', 'Kikuyu'], licenceClass: 'B', licenceExpiresAt: '2028-04-30T00:00:00.000Z', psvExpiresAt: '2027-06-30T00:00:00.000Z', rating: 4.9, currentTrip: { bookingId: 'booking-04', reference: 'BK-2611-0004', pickupAt: '2026-11-04T06:00:00.000Z' } },
  { id: 'drv-03', name: 'Samuel Muriuki', email: 'samuel.driver@autohire.ke', phone: '254712345621', role: 'driver', status: 'available', languages: ['English', 'Kiswahili'], licenceClass: 'C1', licenceExpiresAt: '2028-02-28T00:00:00.000Z', psvExpiresAt: '2027-08-31T00:00:00.000Z', rating: 4.6 },
  { id: 'drv-06', name: 'Asha Njeri', email: 'asha.driver@autohire.ke', phone: '254712345624', role: 'driver', status: 'available', languages: ['English', 'Kiswahili'], licenceClass: 'B', licenceExpiresAt: '2028-06-30T00:00:00.000Z', psvExpiresAt: '2027-09-30T00:00:00.000Z', rating: 4.7 },
  { id: 'drv-04', name: 'David Kiptoo', email: 'david.driver@autohire.ke', phone: '254712345622', role: 'driver', status: 'off_duty', languages: ['English', 'Kalenjin'], licenceClass: 'B', licenceExpiresAt: '2025-01-31T00:00:00.000Z', psvExpiresAt: '2027-03-31T00:00:00.000Z', rating: 4.2 },
  { id: 'drv-05', name: 'Peter Kamau', email: 'peter.driver@autohire.ke', phone: '254712345623', role: 'driver', status: 'off_duty', languages: ['English', 'Kiswahili'], licenceClass: 'B', licenceExpiresAt: '2027-10-31T00:00:00.000Z', psvExpiresAt: '2025-03-31T00:00:00.000Z', rating: 4.4 },
]

export const staffMembers = users.map((user) => ({
  ...user,
  branch: user.branch ?? 'Nairobi HQ',
  active: user.active ?? true,
  lastLogin: user.lastLogin ?? '2026-11-10T09:00:00.000Z',
}))

export const customers = [
  { id: 'cus-01', name: 'Faith Wambui' },
  { id: 'cus-02', name: 'Samuel Kipchoge' },
  { id: 'cus-03', name: 'Grace Atieno' },
  { id: 'cus-04', name: 'Joseph Kamau' },
  { id: 'cus-05', name: 'Lilian Muthoni' },
]

export const vehicles: Vehicle[] = [
  { id: 'car-01', make: 'Toyota', model: 'Prado TX', year: 2023, registration: 'KDA 101A', seats: 7, transmission: 'automatic', ratePerDay: 18000, status: 'available' },
  { id: 'car-02', make: 'Toyota', model: 'Axio', year: 2022, registration: 'KDB 202B', seats: 5, transmission: 'automatic', ratePerDay: 6500, status: 'booked' },
  { id: 'car-03', make: 'Nissan', model: 'X-Trail', year: 2023, registration: 'KDC 303C', seats: 7, transmission: 'automatic', ratePerDay: 14000, status: 'available' },
  { id: 'car-04', make: 'Toyota', model: 'Noah', year: 2022, registration: 'KDD 404D', seats: 8, transmission: 'automatic', ratePerDay: 12000, status: 'available' },
  { id: 'car-05', make: 'Mazda', model: 'Demio', year: 2021, registration: 'KDE 505E', seats: 5, transmission: 'automatic', ratePerDay: 5500, status: 'maintenance' },
  { id: 'car-06', make: 'Toyota', model: 'RAV4', year: 2023, registration: 'KDF 606F', seats: 5, transmission: 'automatic', ratePerDay: 11000, status: 'available' },
  { id: 'car-07', make: 'Subaru', model: 'Forester', year: 2022, registration: 'KDG 707G', seats: 5, transmission: 'automatic', ratePerDay: 12500, status: 'booked' },
  { id: 'car-08', make: 'Toyota', model: 'Hiace', year: 2021, registration: 'KDH 808H', seats: 14, transmission: 'manual', ratePerDay: 16000, status: 'available' },
  { id: 'car-09', make: 'Toyota', model: 'Land Cruiser V8', year: 2022, registration: 'KDJ 909J', seats: 7, transmission: 'automatic', ratePerDay: 28000, status: 'available' },
  { id: 'car-10', make: 'Honda', model: 'Fit', year: 2020, registration: 'KDK 010K', seats: 5, transmission: 'automatic', ratePerDay: 4800, status: 'inactive' },
  { id: 'car-11', make: 'Mazda', model: 'CX-5', year: 2023, registration: 'KDL 111L', seats: 5, transmission: 'automatic', ratePerDay: 13000, status: 'available' },
  { id: 'car-12', make: 'Toyota', model: 'Fielder', year: 2021, registration: 'KDM 212M', seats: 5, transmission: 'automatic', ratePerDay: 7000, status: 'booked' },
]

const bookingStatuses: BookingStatus[] = [
  'reserved', 'confirmed', 'checked_out', 'overdue', 'completed', 'cancelled', 'expired', 'active',
  'awaiting_approval', 'approved',
  'reserved', 'confirmed', 'checked_out', 'confirmed', 'completed', 'reserved', 'overdue', 'cancelled',
  'reserved', 'confirmed',
]

export const bookings: Booking[] = bookingStatuses.map((status, index) => {
  const day = String((index % 27) + 1).padStart(2, '0')
  const vehicle = vehicles[index % vehicles.length]
  const baseDays = (index % 5) + 1
  const mode = index % 3 === 0 ? 'chauffeur' as const : 'self_drive' as const
  const baseAmountKes = vehicle.ratePerDay * baseDays
  const chauffeurFeeKes = mode === 'chauffeur' ? 3500 * baseDays : 0
  const extras = index % 2 === 0 ? [{ code: 'baby_seat', label: 'Baby seat', amountKes: 500 * baseDays }] : []
  const vatAmountKes = Math.round((baseAmountKes + chauffeurFeeKes + extras.reduce((sum, item) => sum + item.amountKes, 0)) * 0.16)
  const totalDueKes = baseAmountKes + chauffeurFeeKes + extras.reduce((sum, item) => sum + item.amountKes, 0) + vatAmountKes
  const user = users[index % users.length]
  const customer = customers[index % customers.length]
  return {
    id: `booking-${String(index + 1).padStart(2, '0')}`,
    reference: `BK-2611-${String(index + 1).padStart(4, '0')}`,
    vehicleId: vehicle.id,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: `254712345${String(index + 1).padStart(3, '0')}`,
    customerEmail: `${customer.name.toLowerCase().replaceAll(' ', '.')}@example.ke`,
    customerIdNumber: `ID${String(100000 + index)}`,
    status,
    pendingApproval: status === 'reserved' && index % 2 === 0,
    mode,
    paymentMethod: (['mpesa_online', 'mpesa_manual', 'cash', 'bank', 'corporate'] as const)[index % 5],
    holdExpiresAt: status === 'reserved' ? new Date(Date.now() + (30 + index * 3) * 60_000).toISOString() : undefined,
    createdById: user.id,
    pickupAt: `2026-11-${day}T06:00:00.000Z`,
    returnAt: `2026-11-${day}T15:00:00.000Z`,
    totalKes: totalDueKes,
    pricingSnapshot: {
      baseDays,
      baseRateKes: vehicle.ratePerDay,
      baseAmountKes,
      chauffeurFeeKes,
      extras,
      vatRate: 16,
      vatAmountKes,
      totalDueKes,
      refundableDepositKes: 15000,
    },
    payments: index % 4 === 0 ? [{ id: `pay-${index + 1}`, method: 'mpesa_manual', amountKes: 5000, status: 'pending', reference: `MP-${index + 1}`, createdAt: `2026-11-${day}T05:30:00.000Z` }] : [],
    events: [{ id: `evt-${index + 1}`, type: 'created', actor: user.name, note: 'Booking created', createdAt: `2026-11-${day}T05:00:00.000Z` }],
    driver: mode === 'chauffeur' ? drivers[index % 2 === 0 ? 0 : 1] : undefined,
    inspections: [],
    auditEntries: [{ id: `audit-${index + 1}`, type: 'booking.created', actor: user.name, note: 'Booking record created', createdAt: `2026-11-${day}T05:00:00.000Z` }],
    accruedLateFeeKes: status === 'overdue' ? 1500 * (index + 1) : 0,
  }
})

export const mechanics: Mechanic[] = [
  { id: 'mech-01', name: 'Central Rescue Team', phone: '254700111001', whatsapp: '254700111001', county: 'Nairobi', town: 'CBD', type: 'in_house', specialties: ['battery', 'overheating', 'flat_tyre'], callOutRateKes: 0, location: { type: 'Point', coordinates: [36.8219, -1.2921] } },
  { id: 'mech-02', name: 'Kilimani Auto Care', phone: '254700111002', whatsapp: '254700111002', county: 'Nairobi', town: 'Kilimani', type: 'partner_garage', specialties: ['battery', 'strange_noise'], callOutRateKes: 2500, location: { type: 'Point', coordinates: [36.787, -1.2928] } },
  { id: 'mech-03', name: 'Westlands Motor Clinic', phone: '254700111003', whatsapp: '254700111003', county: 'Nairobi', town: 'Westlands', type: 'partner_garage', specialties: ['overheating', 'accident'], callOutRateKes: 3500, location: { type: 'Point', coordinates: [36.804, -1.263] } },
  { id: 'mech-04', name: 'Rapid Tow Nairobi', phone: '254700111004', whatsapp: '254700111004', county: 'Nairobi', town: 'Industrial Area', type: 'towing', specialties: ['accident', 'flat_tyre'], callOutRateKes: 5000, location: { type: 'Point', coordinates: [36.85, -1.314] } },
  { id: 'mech-05', name: 'Ngara Roadside Assist', phone: '254700111005', whatsapp: '254700111005', county: 'Nairobi', town: 'Ngara', type: 'partner_garage', specialties: ['flat_tyre', 'battery'], callOutRateKes: 1800, location: { type: 'Point', coordinates: [36.833, -1.276] } },
  { id: 'mech-06', name: 'Mombasa Auto Rescue', phone: '254700111006', whatsapp: '254700111006', county: 'Mombasa', town: 'Mombasa Island', type: 'partner_garage', specialties: ['overheating', 'strange_noise'], callOutRateKes: 4000, location: { type: 'Point', coordinates: [39.6682, -4.0435] } },
]

export const incidents: Incident[] = [
  { id: 'inc-01', reference: 'SOS-101', status: 'open', category: 'flat_tyre', description: 'Vehicle breakdown reported', createdAt: '2026-11-14T06:20:00.000Z', location: { type: 'Point', coordinates: [36.8172, -1.2864] }, locationText: 'Nairobi CBD', vehicleId: 'car-03', immobilising: true, photos: [], source: 'driver' },
  { id: 'inc-02', reference: 'SOS-102', status: 'dispatched', category: 'battery', description: 'Battery replacement dispatched', createdAt: '2026-11-14T07:15:00.000Z', location: { type: 'Point', coordinates: [36.787, -1.2928] }, locationText: 'Kilimani', vehicleId: 'car-04', immobilising: false, photos: [], source: 'desk', dispatch: { type: 'closest_partner', mechanicId: 'mech-02', createdAt: '2026-11-14T07:20:00.000Z' } },
  { id: 'inc-03', reference: 'SOS-103', status: 'resolved', category: 'overheating', description: 'Cooling system checked', createdAt: '2026-11-13T10:00:00.000Z', location: { type: 'Point', coordinates: [36.804, -1.263] }, locationText: 'Westlands', vehicleId: 'car-11', immobilising: false, photos: [], source: 'customer' },
]

export const auditEntries = [
  {
    id: 'audit-01',
    actor: 'Amina Njeri',
    action: 'booking.approved',
    entity: 'booking',
    createdAt: '2026-11-14T08:12:00.000Z',
    before: { status: 'reserved', paymentMethod: 'cash' },
    after: { status: 'confirmed', paymentMethod: 'cash' },
  },
  {
    id: 'audit-02',
    actor: 'Brian Otieno',
    action: 'staff.role_changed',
    entity: 'staff',
    createdAt: '2026-11-14T09:40:00.000Z',
    before: { role: 'agent' },
    after: { role: 'manager' },
  },
  {
    id: 'audit-03',
    actor: 'Amina Njeri',
    action: 'vehicle.assigned',
    entity: 'vehicle',
    createdAt: '2026-11-13T16:00:00.000Z',
    before: { vehicleId: 'car-04' },
    after: { vehicleId: 'car-04', assignedTo: 'Wanjiku Kamau' },
  },
]

export const maintenanceWindows: MaintenanceWindow[] = [
  { id: 'maint-01', vehicleId: 'car-05', startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), endAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(), reason: 'Scheduled service' },
  { id: 'maint-02', vehicleId: 'car-10', startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), endAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), reason: 'Inspection and repairs' },
]
