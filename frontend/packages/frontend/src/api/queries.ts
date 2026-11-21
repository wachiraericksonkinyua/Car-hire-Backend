import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from './client'
import type {
  AvailableDriversResponse,
  Booking,
  BookingCreateRequest,
  DashboardData,
  DriverTripStatus,
  HealthStatus,
  IncidentCreateRequest,
  IncidentDispatchType,
  MaintenanceWindow,
  MechanicCreateRequest,
  NotificationCounts,
  PaymentMethod,
  QuoteRequest,
  SearchResult,
  StorageOverview,
  VehiclePhoto,
} from './types'
import {
  mapBooking,
  mapDashboard,
  mapDriver,
  mapIncident,
  mapMechanic,
  mapNearbyMechanic,
  mapQuote,
  mapVehicle,
  toBackendBooking,
  type BackendBooking,
  type BackendDriver,
  type BackendIncident,
  type BackendMechanic,
  type BackendQuote,
  type BackendVehicle,
} from './backend'
import { buildDashboardData } from '../features/dashboard/dashboardData'
import { compressImage } from '../lib/image'

const isWeb = __APP_TARGET__ === 'web'

const backendPaymentMethod: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank: 'Bank EFT',
  corporate: 'Corporate Credit',
  mpesa_manual: 'M-Pesa Manual',
  mpesa_online: 'M-Pesa Manual',
}

const backendTripStatus: Record<DriverTripStatus, string> = {
  en_route_to_pickup: 'EnRoute',
  customer_onboard: 'CustomerOnboard',
  trip_completed: 'Completed',
}

function tripToBooking(trip: {
  booking_id: string
  reference: string
  status: string
  trip_status: string | null
  customer_name: string
  customer_phone: string
  pickup_at: string
  return_at: string
  pickup_location: string | null
  vehicle_plate: string
  vehicle_model: string
}): Booking {
  return {
    id: trip.booking_id,
    reference: trip.reference,
    vehicleId: '',
    customerId: '',
    customerName: trip.customer_name,
    customerPhone: trip.customer_phone,
    status: trip.status === 'CheckedOut' ? 'checked_out' : trip.status === 'Overdue' ? 'overdue' : 'confirmed',
    pickupAt: trip.pickup_at,
    returnAt: trip.return_at,
    totalKes: 0,
    driverTripStatus: trip.trip_status === 'EnRoute' ? 'en_route_to_pickup' : trip.trip_status === 'CustomerOnboard' ? 'customer_onboard' : trip.trip_status === 'Completed' ? 'trip_completed' : undefined,
    vehicleRegistration: trip.vehicle_plate,
  }
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => apiClient.get<HealthStatus>('/health') })
}

export function useVehicles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['vehicles', __APP_TARGET__],
    queryFn: async () => {
      const data = await apiClient.get<{ items: BackendVehicle[] }>(`${isWeb ? '/public' : ''}/vehicles?limit=100`)
      return data.items.map(mapVehicle)
    },
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}

export function useStorage() {
  return useQuery({
    queryKey: ['system-storage'],
    queryFn: () => apiClient.get<StorageOverview>('/system/storage'),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })
}

export function useUploadVehiclePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehicleId, file, caption }: { vehicleId: string; file: File; caption?: string }) => {
      const body = new FormData()
      const compressed = await compressImage(file)
      body.append('file', compressed)
      if (caption?.trim()) body.append('caption', caption.trim())
      return apiClient.upload<VehiclePhoto>(`/vehicles/${encodeURIComponent(vehicleId)}/photos`, body, () => undefined)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicle'] }),
        queryClient.invalidateQueries({ queryKey: ['system-storage'] }),
      ])
    },
  })
}

export function useDeleteVehiclePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehicleId, photoId }: { vehicleId: string; photoId: string }) =>
      apiClient.delete(`/vehicles/${encodeURIComponent(vehicleId)}/photos/${encodeURIComponent(photoId)}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicle'] }),
        queryClient.invalidateQueries({ queryKey: ['system-storage'] }),
      ])
    },
  })
}

export function useUpdateVehiclePhotoCaption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehicleId, photoId, caption }: { vehicleId: string; photoId: string; caption: string }) =>
      apiClient.patch(`/vehicles/${encodeURIComponent(vehicleId)}/photos/${encodeURIComponent(photoId)}`, { caption }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['public-vehicle'] }),
      ])
    },
  })
}

export function useMaintenanceWindows(from: string, to: string) {
  return useQuery({
    queryKey: ['maintenance-windows', from, to],
    queryFn: async () => [] as MaintenanceWindow[],
    enabled: Boolean(from && to),
  })
}

export function useBookings() {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const data = await apiClient.get<{ items: BackendBooking[] }>('/bookings?limit=100')
      return data.items.map(mapBooking)
    },
  })
}

export function useBookingList(query: string) {
  return useQuery({
    queryKey: ['bookings', query],
    queryFn: async () => {
      const params = new URLSearchParams(query)
      const statusMap: Record<string, string> = {
        reserved: 'Reserved',
        confirmed: 'Confirmed',
        checked_out: 'CheckedOut',
        overdue: 'Overdue',
        completed: 'Completed',
        cancelled: 'Cancelled',
        expired: 'Expired',
      }
      const status = params.get('status')
      if (status && statusMap[status]) params.set('status', statusMap[status])
      if (params.get('pendingApproval')) {
        params.delete('pendingApproval')
        params.set('pending_approval', 'true')
      }
      const data = await apiClient.get<{ items: BackendBooking[] }>(`/bookings?limit=100${params.toString() ? `&${params.toString()}` : ''}`)
      return data.items.map(mapBooking)
    },
  })
}

export function useBookingDetail(id: string) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: async () => mapBooking(await apiClient.get<BackendBooking>(`/bookings/${id}`)),
    enabled: Boolean(id),
  })
}

export function useAvailableVehicles(from: string, to: string) {
  return useQuery({
    queryKey: ['available-vehicles', __APP_TARGET__, from, to],
    queryFn: async () => {
      const data = await apiClient.get<{ items: BackendVehicle[] }>(
        `${isWeb ? '/public' : ''}/vehicles?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&available_only=true&limit=100`,
      )
      return data.items.map(mapVehicle)
    },
    enabled: Boolean(from && to),
  })
}

export function useCalculateQuote() {
  return useMutation({
    mutationFn: async (request: QuoteRequest) => {
      const result = await apiClient.post<BackendQuote>('/quotes/calculate', {
        vehicle_id: request.vehicleId,
        pickup_at: request.pickupAt,
        return_at: request.returnAt,
        with_chauffeur: request.mode === 'chauffeur',
        chauffeur_zone: request.mode === 'chauffeur' ? request.driverLocation ?? 'in_town' : undefined,
        extras: request.extras,
      })
      return mapQuote(result)
    },
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: BookingCreateRequest) => mapBooking(await apiClient.post<BackendBooking>('/bookings', toBackendBooking(request))),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['available-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export function useUpdateBooking(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Booking>) => {
      if (patch.status === 'cancelled') {
        return mapBooking(await apiClient.post<BackendBooking>(`/bookings/${id}/cancel`))
      }
      if (patch.status === 'confirmed') {
        const method = patch.paymentMethod ? backendPaymentMethod[patch.paymentMethod] : 'Cash'
        return mapBooking(await apiClient.patch<BackendBooking>(`/bookings/${id}/approve-offline`, {
          payment_method: method,
          payment_reference: 'STAFF-APPROVAL',
          reason: method === 'Corporate Credit' ? 'Corporate approval from dashboard' : undefined,
        }))
      }
      throw new ApiError('This status change is not supported here yet', 409)
    },
    onSuccess: async (booking) => {
      queryClient.setQueryData(['booking', id], booking)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      ])
    },
  })
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        const data = await apiClient.get<Parameters<typeof mapDashboard>[0]>('/dashboard')
        return mapDashboard(data)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return buildDashboardData()
        throw error
      }
    },
    staleTime: 30_000,
    refetchInterval: 45_000,
  })
}

export function useShellNotifications() {
  return useQuery({
    queryKey: ['shell-notifications'],
    queryFn: async () => {
      const data = await apiClient.get<Parameters<typeof mapDashboard>[0] | DashboardData>('/dashboard')
      if ('kpis' in data) {
        return {
          pendingApprovals: data.kpis.pending_approvals,
          openIncidents: data.kpis.active_breakdowns,
        } satisfies NotificationCounts
      }
      return {
        pendingApprovals: data.metrics.pendingApprovals ?? 0,
        openIncidents: data.metrics.activeBreakdowns ?? 0,
      }
    },
    refetchInterval: 30_000,
  })
}

export function useGlobalSearch(query: string, enabled = true) {
  const search = query.trim()
  return useQuery({
    queryKey: ['global-search', search],
    queryFn: async () => {
      const [bookings, vehicles] = await Promise.all([
        apiClient.get<{ items: BackendBooking[] }>(`/bookings?search=${encodeURIComponent(search)}&limit=10`),
        apiClient.get<{ items: BackendVehicle[] }>(`/vehicles?plate=${encodeURIComponent(search)}&limit=10`),
      ])
      const results: SearchResult[] = [
        ...bookings.items.map((booking) => ({
          id: booking.id,
          type: 'booking' as const,
          title: booking.reference,
          subtitle: booking.customer_name ?? 'Booking',
          href: `/admin/bookings/${booking.id}`,
        })),
        ...vehicles.items.map((vehicle) => ({
          id: vehicle.id,
          type: 'vehicle' as const,
          title: `${vehicle.brand} ${vehicle.model}`,
          subtitle: vehicle.plate_number,
          href: `/admin/vehicles/${vehicle.id}`,
        })),
      ]
      return results
    },
    enabled: enabled && search.length >= 2,
    staleTime: 30_000,
  })
}

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const data = await apiClient.get<BackendDriver[]>('/drivers')
      return data.map(mapDriver)
    },
  })
}

export function useAvailableDrivers(from: string, to: string, vehicleId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['drivers', 'available', from, to, vehicleId],
    queryFn: async () => {
      const data = await apiClient.get<BackendDriver[]>(
        `/drivers/available?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&vehicle_id=${encodeURIComponent(vehicleId)}`,
      )
      return { drivers: data.map(mapDriver), autoAssignDriverId: null } satisfies AvailableDriversResponse
    },
    enabled: enabled && Boolean(from && to),
  })
}

export function useMyDriverTrips() {
  return useQuery({
    queryKey: ['driver-trips'],
    queryFn: async () => {
      const data = await apiClient.get<Parameters<typeof tripToBooking>[0][]>('/drivers/my-trips')
      return data.map(tripToBooking)
    },
  })
}

export function useAssignDriver(bookingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (driverId: string) => mapBooking(await apiClient.patch<BackendBooking>(`/bookings/${encodeURIComponent(bookingId)}/assign-driver`, {
      driver_id: driverId,
    })),
    onSuccess: async (booking) => {
      queryClient.setQueryData(['booking', bookingId], booking)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['drivers'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
      ])
    },
  })
}

export function useUpdateDriverTripStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: DriverTripStatus }) =>
      tripToBooking(await apiClient.patch<Parameters<typeof tripToBooking>[0]>(`/drivers/my-trips/${encodeURIComponent(bookingId)}`, {
        status: backendTripStatus[status],
      })),
    onSuccess: async (booking) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['driver-trips'] }),
        queryClient.invalidateQueries({ queryKey: ['booking', booking.id] }),
      ])
    },
  })
}

export function useMechanics() {
  return useQuery({
    queryKey: ['mechanics'],
    queryFn: async () => {
      const data = await apiClient.get<BackendMechanic[]>('/mechanics')
      return data.map(mapMechanic)
    },
  })
}

export function useNearestMechanics(latitude: number, longitude: number, category?: string, enabled = true) {
  return useQuery({
    queryKey: ['mechanics', 'nearest', latitude, longitude, category],
    queryFn: async () => {
      const data = await apiClient.get<BackendMechanic[]>(
        `/mechanics/nearest?lat=${latitude}&lng=${longitude}&limit=5`,
      )
      return data.map(mapNearbyMechanic)
    },
    enabled,
  })
}

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const data = await apiClient.get<BackendIncident[]>('/incidents')
      return data.map(mapIncident)
    },
    refetchInterval: 15_000,
  })
}

const reverseMechanicType: Record<string, string> = {
  in_house: 'InHouse',
  partner_garage: 'PartnerGarage',
  towing: 'Towing',
}

export function useCreateMechanic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: MechanicCreateRequest) => {
      const result = await apiClient.post<BackendMechanic>('/mechanics', {
        name: request.name,
        garage: null,
        phone: request.phone,
        whatsapp: request.whatsapp || null,
        county: request.county,
        town: request.town || null,
        mechanic_type: reverseMechanicType[request.type],
        specialties: request.specialties,
        call_out_rate_kes: request.callOutRateKes,
        latitude: request.location.coordinates[1],
        longitude: request.location.coordinates[0],
      })
      return mapMechanic(result)
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['mechanics'] }),
  })
}

export function useCreateIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: IncidentCreateRequest) => {
      const result = await apiClient.post<BackendIncident>('/incidents/breakdown', {
        vehicle_id: request.vehicleId,
        category: request.category,
        description: request.description || null,
        latitude: request.location.coordinates[1],
        longitude: request.location.coordinates[0],
        requires_workshop: request.immobilising,
      })
      return mapIncident(result)
    },
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incidents'] }),
      queryClient.invalidateQueries({ queryKey: ['shell-notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]),
  })
}

export function useDispatchIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, type, mechanicId }: { incidentId: string; type: IncidentDispatchType; mechanicId?: string; vehicleId?: string }) => {
      const dispatchType = type === 'closest_partner' ? 'PartnerMechanic' : type === 'in_house_rescue' ? 'InHouseRescue' : 'ReplacementVehicle'
      return mapIncident(await apiClient.patch<BackendIncident>(`/incidents/${encodeURIComponent(incidentId)}/dispatch`, {
        dispatch_type: dispatchType,
        mechanic_id: mechanicId ?? null,
      }))
    },
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incidents'] }),
      queryClient.invalidateQueries({ queryKey: ['shell-notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['timeline-incidents'] }),
    ]),
  })
}
