import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Timeline, { DateHeader, SidebarHeader, TimelineHeaders } from 'react-calendar-timeline'
import 'react-calendar-timeline/style.css'
import { AlertTriangle, CalendarDays, Clock3 } from 'lucide-react'
import { useBookingList, useIncidents, useMaintenanceWindows, useVehicles } from '../../api/queries'
import type { Booking } from '../../api/types'
import { Button, Drawer, EmptyState, ErrorState, Skeleton } from '../../components/ui'
import { formatEat, formatKes } from '../../lib'
import { buildBookingPrefillUrl, buildTimelineItems, getTimelineStatusColor, type FleetTimelineItem } from './timelineModel'

const DAY_MS = 24 * 60 * 60 * 1000

function todayStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const statusLegend: { status: Booking['status']; label: string }[] = [
  { status: 'reserved', label: 'Reserved' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'checked_out', label: 'Checked out' },
  { status: 'overdue', label: 'Overdue' },
]

export function TimelinePage() {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7)
  const [visibleRange, setVisibleRange] = useState(() => {
    const start = todayStart()
    return { start, end: start + 7 * DAY_MS }
  })
  // The canvas updates immediately, but the API range is debounced so a
  // scroll gesture cannot refetch on every frame and make the timeline jump.
  const [queryRange, setQueryRange] = useState(visibleRange)
  const queryTimer = useRef<number | undefined>(undefined)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  // react-calendar-timeline emits onTimeChange on mount and on every scroll.
  // Only refetch when the window actually moves by a meaningful amount so a
  // re-render cannot feed back into a new query and loop forever.
  const lastRange = useRef({ start: visibleRange.start, end: visibleRange.end })
  const navigate = useNavigate()
  const rangeStart = visibleRange.start
  const rangeEnd = visibleRange.end
  const from = new Date(queryRange.start).toISOString()
  const to = new Date(queryRange.end).toISOString()
  const bookingsQuery = useBookingList(new URLSearchParams({ from, to }).toString())
  const vehiclesQuery = useVehicles()
  const maintenanceQuery = useMaintenanceWindows(from, to)
  const incidentsQuery = useIncidents()
  const bookings = bookingsQuery.data ?? []
  const vehicles = vehiclesQuery.data ?? []
  const incidents = incidentsQuery.data ?? []
  const items = useMemo(
    () => buildTimelineItems(bookings, maintenanceQuery.data ?? [], undefined, incidents),
    [bookings, maintenanceQuery.data, incidents],
  )
  const groups = useMemo(() => vehicles.map((vehicle) => ({
    id: vehicle.id,
    title: <span className="fleet-timeline__vehicle"><strong>{vehicle.registration}</strong><small>{vehicle.make} {vehicle.model}</small></span>,
    stackItems: true,
    height: 54,
  })), [vehicles])

  useEffect(() => () => window.clearTimeout(queryTimer.current), [])

  function chooseRange(days: 7 | 30) {
    setRangeDays(days)
    const start = todayStart()
    const end = start + days * DAY_MS
    lastRange.current = { start, end }
    window.clearTimeout(queryTimer.current)
    setVisibleRange({ start, end })
    setQueryRange({ start, end })
  }

  function handleTimeChange(start: number, end: number, updateScrollCanvas: (start: number, end: number) => void) {
    updateScrollCanvas(start, end)
    setVisibleRange({ start, end })
    const previous = lastRange.current
    if (Math.abs(start - previous.start) < 60_000 && Math.abs(end - previous.end) < 60_000) return
    lastRange.current = { start, end }
    window.clearTimeout(queryTimer.current)
    queryTimer.current = window.setTimeout(() => setQueryRange({ start, end }), 500)
  }

  function handleCanvasClick(groupId: string | number, time: number) {
    setSelectedBooking(null)
    navigate(buildBookingPrefillUrl(groupId, time))
  }

  function handleItemClick(itemId: string | number) {
    const item = items.find((entry) => entry.id === itemId)
    if (item?.kind === 'incident_warning' && item.incidentId) {
      navigate(`/admin/incidents?incidentId=${encodeURIComponent(item.incidentId)}`)
      return
    }
    if (item?.kind !== 'booking' || !item.bookingId) return
    setSelectedBooking(bookings.find((booking) => booking.id === item.bookingId) ?? null)
  }

  const isLoading = bookingsQuery.isLoading || vehiclesQuery.isLoading || maintenanceQuery.isLoading || incidentsQuery.isLoading
  const hasError = bookingsQuery.isError || vehiclesQuery.isError || maintenanceQuery.isError || incidentsQuery.isError

  return (
    <section className="fleet-timeline-page">
      <header className="fleet-timeline-page__header">
        <div><p className="eyebrow">Fleet operations</p><h1>Fleet timeline</h1><p>Bookings, turnaround time and maintenance by vehicle.</p></div>
        <div aria-label="Timeline range" className="timeline-range" role="group">
          <Button aria-pressed={rangeDays === 7} onClick={() => chooseRange(7)} variant={rangeDays === 7 ? 'primary' : 'secondary'}><CalendarDays aria-hidden="true" size={16} /> 7 days</Button>
          <Button aria-pressed={rangeDays === 30} onClick={() => chooseRange(30)} variant={rangeDays === 30 ? 'primary' : 'secondary'}><CalendarDays aria-hidden="true" size={16} /> 30 days</Button>
        </div>
      </header>

      <div aria-label="Booking status legend" className="fleet-timeline-legend">
        {statusLegend.map(({ status, label }) => <span key={status}><i style={{ backgroundColor: getTimelineStatusColor(status) }} />{label}</span>)}
        <span className="fleet-timeline-legend__buffer"><i />Turnaround buffer</span>
        <span className="fleet-timeline-legend__maintenance"><i /><AlertTriangle aria-hidden="true" size={14} />Maintenance</span>
      </div>

      {isLoading && <Skeleton rows={5} />}
      {hasError && <ErrorState onRetry={() => { void bookingsQuery.refetch(); void vehiclesQuery.refetch(); void maintenanceQuery.refetch(); void incidentsQuery.refetch() }} retryLabel="Retry" title="Timeline data could not be loaded" />}
      {!isLoading && !hasError && vehicles.length === 0 && <EmptyState description="Add vehicles to see their bookings here." title="No vehicles found" />}
      {!isLoading && !hasError && vehicles.length > 0 && <div className="fleet-timeline-scroll" data-testid="fleet-timeline">
        <Timeline<FleetTimelineItem>
          canMove={false}
          canResize={false}
          groups={groups}
          itemHeightRatio={0.78}
          items={items}
          maxZoom={30 * DAY_MS}
          minZoom={7 * DAY_MS}
          onCanvasClick={handleCanvasClick}
          onItemClick={handleItemClick}
          onTimeChange={handleTimeChange}
          sidebarWidth={170}
          stackItems
          timeSteps={{ second: 60, minute: 30, hour: 1, day: 1, month: 1, year: 1 }}
          visibleTimeEnd={rangeEnd}
          visibleTimeStart={rangeStart}
        >
          <TimelineHeaders>
            <SidebarHeader>{({ getRootProps }) => <div {...getRootProps({ style: {} })}><span className="fleet-timeline__sidebar-title">Vehicle</span></div>}</SidebarHeader>
            <DateHeader unit="primaryHeader" />
            <DateHeader unit="day" />
          </TimelineHeaders>
        </Timeline>
      </div>}

      {selectedBooking && <Drawer open title={selectedBooking.reference} onClose={() => setSelectedBooking(null)}>
        <div className="fleet-timeline-drawer">
          <span className={`fleet-timeline-drawer__status fleet-timeline-drawer__status--${selectedBooking.status}`}>
            {selectedBooking.status === 'overdue' && <AlertTriangle aria-hidden="true" size={15} />}
            {selectedBooking.status === 'overdue' ? 'Overdue' : selectedBooking.status.replaceAll('_', ' ')}
          </span>
          <dl>
            <div><dt>Customer</dt><dd>{selectedBooking.customerName ?? '—'}</dd></div>
            <div><dt>Vehicle</dt><dd>{vehicles.find((vehicle) => vehicle.id === selectedBooking.vehicleId)?.registration ?? selectedBooking.vehicleId}</dd></div>
            <div><dt>Pickup</dt><dd>{formatEat(selectedBooking.pickupAt)}</dd></div>
            <div><dt>Return</dt><dd>{formatEat(selectedBooking.returnAt)}</dd></div>
            <div><dt>Amount</dt><dd>{formatKes(selectedBooking.totalKes)}</dd></div>
            {selectedBooking.status === 'overdue' && <div><dt>Late fees</dt><dd className="fleet-timeline-drawer__danger"><Clock3 aria-hidden="true" size={15} /> {formatKes(selectedBooking.accruedLateFeeKes ?? 0)}</dd></div>}
          </dl>
          <Link className="button button--primary" to={`/admin/bookings/${selectedBooking.id}`}>Open booking</Link>
        </div>
      </Drawer>}
    </section>
  )
}