import { apiClient } from './client'

export interface PublicVehicle {
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
  specs: Record<string, unknown> | null
  status: string
  insurance_expired: boolean
  created_at: string
  photos?: { id: string; url: string; sort_order: number }[]
}

export interface PublicVehicleList {
  items: PublicVehicle[]
  total: number
  limit: number
  offset: number
}

export interface BookedRange {
  booking_id: string
  reference: string
  pickup_at: string
  return_at: string
  block_until: string
  status: string
}

export interface PublicVehicleDetail extends PublicVehicle {
  booked_ranges: BookedRange[]
}

export interface PublicQuote {
  vehicle_id: string
  daily_rate_kes: number
  days: number
  base_rental_kes: number
  chauffeur_zone: string | null
  chauffeur_days: number
  chauffeur_rate_kes: number
  chauffeur_fee_kes: number
  extras: {
    code: string
    label: string
    quantity: number
    unit_rate_kes: number
    amount_kes: number
    taxable: boolean
  }[]
  taxable_subtotal_kes: number
  vat_percent: number
  vat_kes: number
  deposit_kes: number
  total_due_kes: number
}

export interface PublicBooking {
  reference: string
  status: string
  vehicle_id: string
  pickup_at: string
  return_at: string
  hold_expires_at: string
  total_kes: number
  pricing_snapshot: Record<string, unknown> | null
}

export interface PublicBookingStatus extends PublicBooking {
  payment_status: string | null
  mpesa_receipt: string | null
  refund_required: boolean | null
}

export type PublicExtra =
  | 'baby_seat'
  | 'rooftop_tent'
  | 'cooler_box'
  | 'airport_pickup'

export function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function fetchPublicVehicles(filters: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.get<PublicVehicleList>(`/public/vehicles${queryString(filters)}`)
}

export function fetchPublicVehicle(id: string, from?: string, to?: string) {
  return apiClient.get<PublicVehicleDetail>(`/public/vehicles/${id}${queryString({ from, to })}`)
}

export function calculatePublicQuote(input: {
  vehicle_id: string
  pickup_at: string
  return_at: string
  with_chauffeur: boolean
  chauffeur_zone?: 'in_town' | 'upcountry'
  extras: PublicExtra[]
}) {
  return apiClient.post<PublicQuote>('/public/quotes/calculate', input)
}

export function createPublicBooking(input: {
  vehicle_id: string
  pickup_at: string
  return_at: string
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  customer_id_type?: string | null
  customer_id_number?: string | null
  pickup_location?: string | null
  with_chauffeur: boolean
  chauffeur_zone?: 'in_town' | 'upcountry'
  extras: PublicExtra[]
}) {
  return apiClient.post<PublicBooking>('/public/bookings', input)
}

export function lookupPublicBooking(reference: string, phone: string) {
  return apiClient.get<PublicBookingStatus>(`/public/bookings/${encodeURIComponent(reference)}${queryString({ phone })}`)
}

export function startPublicStk(reference: string, phoneNumber: string) {
  return apiClient.post<{ checkout_request_id: string; status: string }>('/public/payments/stk-push', {
    reference,
    phone_number: phoneNumber,
  })
}

export function pollPublicPayment(checkoutRequestId: string, reference: string, phone: string) {
  return apiClient.get<{
    checkout_request_id: string
    status: string
    booking_status: string
    amount_due_kes: number
    amount_paid_kes: number
    amount_mismatch: boolean
    refund_required: boolean
    mpesa_receipt: string | null
    phone_masked: string | null
  }>(
    `/public/payments/${encodeURIComponent(checkoutRequestId)}${queryString({ reference, phone })}`,
  )
}
