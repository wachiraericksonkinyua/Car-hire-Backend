import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError, apiClient } from '../../api/client'
import { useAvailableVehicles, useCreateBooking } from '../../api/queries'
import type { Booking, DriveMode, QuoteRequest, QuoteResponse, Vehicle } from '../../api/types'
import { Button, DateTimeRangePicker, Input, PhoneInput, Select, Stepper } from '../../components/ui'
import { useAuth } from '../../hooks/AuthContext'
import { t } from '../../i18n'
import { formatEat, formatKes, isKenyanPhone, normalisePhone } from '../../lib'
import { QuoteBuilder, QuoteBreakdown } from './QuoteBuilder'
import { PaymentStatus } from './PaymentStatus'

const customerSchema = z.object({
  customerName: z.string().trim().min(2, t('booking.stepRequired')),
  customerPhone: z.string().refine(isKenyanPhone, t('booking.phoneInvalid')),
  customerEmail: z.string().trim().email(t('auth.emailInvalid')),
  customerIdNumber: z.string().trim().min(4, t('booking.stepRequired')),
})

type CustomerValues = z.infer<typeof customerSchema>

function VehiclePrice({ vehicle, request, onSelect, selected }: { vehicle: Vehicle; request: QuoteRequest; onSelect: () => void; selected: boolean }) {
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const { mutateAsync } = useMutation({ mutationFn: (payload: QuoteRequest) => apiClient.post<QuoteResponse>('/quotes/calculate', payload) })
  const requestKey = JSON.stringify(request)
  const payload = useMemo(() => ({ ...JSON.parse(requestKey) as QuoteRequest, vehicleId: vehicle.id }), [requestKey, vehicle.id])

  useEffect(() => {
    let active = true
    void mutateAsync(payload).then((result) => {
      if (active) setQuote(result)
    }).catch(() => {
      if (active) setQuote(null)
    })
    return () => { active = false }
  }, [mutateAsync, payload])

  return (
    <button aria-pressed={selected} className={`vehicle-choice${selected ? ' is-selected' : ''}`} onClick={onSelect} type="button">
      <span className="vehicle-choice__details"><b>{vehicle.make} {vehicle.model}</b><small>{vehicle.registration} · {vehicle.seats} {t('styleguide.seats')}</small></span>
      <span className="vehicle-choice__price">{quote ? formatKes(quote.pricingSnapshot.totalDueKes) : t('booking.calculating')}</span>
    </button>
  )
}

export function BookingWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<DriveMode>('self_drive')
  const [paymentMethod, setPaymentMethod] = useState<'mpesa_online' | 'mpesa_manual' | 'cash' | 'bank' | 'corporate'>('mpesa_online')
  const [request, setRequest] = useState<QuoteRequest>(() => ({
    vehicleId: searchParams.get('vehicleId') ?? '',
    pickupAt: searchParams.get('pickupAt') ?? '',
    returnAt: searchParams.get('returnAt') ?? '',
    pickupLocation: '',
    mode: 'self_drive',
    extras: [],
  }))
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [conflict, setConflict] = useState(false)
  const [paymentBooking, setPaymentBooking] = useState<Booking | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const form = useForm<CustomerValues>({ resolver: zodResolver(customerSchema), mode: 'onTouched', defaultValues: { customerName: '', customerPhone: '', customerEmail: '', customerIdNumber: '' } })
  const availableVehicles = useAvailableVehicles(request.pickupAt, request.returnAt)
  const createBooking = useCreateBooking()

  const handleQuoteChange = useCallback((value: QuoteResponse | null) => setQuote(value), [])
  const handleRequestChange = useCallback((value: QuoteRequest) => {
    setRequest(value)
    setMode(value.mode)
    setConflict(false)
  }, [])

  async function validateStep() {
    if (step === 0) return form.trigger()
    if (step === 1) {
      if (!request.pickupAt || !request.returnAt || !request.pickupLocation.trim()) return false
      if (Date.parse(request.pickupAt) < Date.now()) {
        setDateError('booking.pickupPast')
        return false
      }
      if (Date.parse(request.returnAt) <= Date.parse(request.pickupAt)) {
        setDateError('booking.returnAfterPickup')
        return false
      }
      setDateError(null)
      return true
    }
    if (step === 2) return Boolean(request.vehicleId)
    if (step === 3) return Boolean(quote)
    return true
  }

  async function continueStep() {
    if (step === 4) {
      await form.handleSubmit(async (customer) => {
        if (!quote || !request.vehicleId) return
        try {
          const booking = await createBooking.mutateAsync({
            ...request,
            ...customer,
            customerPhone: normalisePhone(customer.customerPhone),
            paymentMethod,
            createdById: user?.id ?? '',
          })
          if (paymentMethod === 'mpesa_online') setPaymentBooking(booking)
          else navigate(`/admin/bookings/${booking.id}`)
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            setConflict(true)
            await availableVehicles.refetch()
          }
        }
      })()
      return
    }
    if (await validateStep()) setStep((current) => Math.min(4, current + 1))
  }

  const updateDates = (range: { startUtc: string; endUtc: string }) => {
    setRequest((current) => ({ ...current, pickupAt: range.startUtc, returnAt: range.endUtc }))
    setConflict(false)
    setDateError(null)
  }

  return (
    <section className="booking-wizard">
      <header className="booking-wizard__header"><p>{t('booking.listTitle')}</p><h2>{t('booking.createFirst')}</h2></header>
      {!paymentBooking && <Stepper activeStep={step} steps={[
        t('booking.steps.customer'), t('booking.steps.dates'), t('booking.steps.vehicle'),
        t('booking.steps.extras'), t('booking.steps.review'),
      ]} />}

      <div className="booking-wizard__body">
        {paymentBooking && <div className="booking-payment-step">
          <h3>Reservation created</h3>
          <p>Complete the M-Pesa request to confirm this booking.</p>
          <PaymentStatus
            amountDueKes={paymentBooking.totalKes}
            bookingId={paymentBooking.id}
            initialPhone={normalisePhone(form.getValues('customerPhone'))}
            onConfirmed={() => navigate(`/admin/bookings/${paymentBooking.id}`)}
          />
        </div>}
        {!paymentBooking && <>
        {step === 0 && <div className="booking-form-grid">
          <Input error={form.formState.errors.customerName?.message} label={t('booking.customerName')} {...form.register('customerName')} />
          <Controller control={form.control} name="customerPhone" render={({ field }) => <PhoneInput error={form.formState.errors.customerPhone?.message} label={t('booking.customerPhone')} onChange={field.onChange} value={field.value} />} />
          <Input error={form.formState.errors.customerEmail?.message} label={t('booking.customerEmail')} type="email" {...form.register('customerEmail')} />
          <Input error={form.formState.errors.customerIdNumber?.message} label={t('booking.customerId')} {...form.register('customerIdNumber')} />
          {mode === 'self_drive' && <label className="field"><span className="field__label">{t('booking.uploadLicence')}</span><input accept="image/*,.pdf" className="control" type="file" /></label>}
          <label className="field"><span className="field__label">{t('booking.uploadId')}</span><input accept="image/*,.pdf" className="control" type="file" /></label>
        </div>}

        {step === 1 && <div className="booking-date-step">
          <DateTimeRangePicker endUtc={request.returnAt} label={t('booking.dateRange')} onChange={updateDates} startUtc={request.pickupAt} />
          <Input label={t('booking.pickupLocation')} onChange={(event) => setRequest((current) => ({ ...current, pickupLocation: event.target.value }))} placeholder={t('booking.pickupPlaceholder')} value={request.pickupLocation} />
          {dateError && <p className="field__error" role="alert">{t(dateError)}</p>}
        </div>}

        {step === 2 && <div className="vehicle-picker-step">
          <h3>{t('booking.availableVehicles')}</h3>
          {availableVehicles.isLoading && <div className="vehicle-choice-list"><span className="skeleton" /><span className="skeleton" /></div>}
          {availableVehicles.isError && <p className="field__error" role="alert">{t('booking.actionError')}</p>}
          {availableVehicles.data?.length === 0 && <p>{t('booking.noAvailableVehicles')}</p>}
          <div className="vehicle-choice-list">
            {(availableVehicles.data ?? []).map((vehicle) => <VehiclePrice key={vehicle.id} onSelect={() => setRequest((current) => ({ ...current, vehicleId: vehicle.id }))} request={request} selected={request.vehicleId === vehicle.id} vehicle={vehicle} />)}
          </div>
        </div>}

        {step === 3 && <>
          <QuoteBuilder onChange={handleRequestChange} onQuoteChange={handleQuoteChange} request={request} showDates={false} showPickupLocation={false} />
          {conflict && <p className="quote-conflict" role="alert">{t('booking.reserveConflict')}</p>}
        </>}

        {step === 4 && <div className="booking-review">
          <section><h3>{t('booking.review')}</h3><dl className="booking-review__customer">
            <div><dt>{t('booking.customerName')}</dt><dd>{form.getValues('customerName')}</dd></div>
            <div><dt>{t('booking.customerPhone')}</dt><dd>{normalisePhone(form.getValues('customerPhone'))}</dd></div>
            <div><dt>{t('booking.customerEmail')}</dt><dd>{form.getValues('customerEmail')}</dd></div>
            <div><dt>{t('booking.pickup')}</dt><dd>{request.pickupAt ? formatEat(request.pickupAt) : '—'}</dd></div>
            <div><dt>{t('booking.return')}</dt><dd>{request.returnAt ? formatEat(request.returnAt) : '—'}</dd></div>
          </dl></section>
          {quote && <QuoteBreakdown quote={quote} />}
          <Select label={t('booking.paymentMethod')} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} options={[
            { value: 'mpesa_online', label: t('booking.mpesaOnline') }, { value: 'mpesa_manual', label: t('booking.mpesaManual') },
            { value: 'cash', label: t('booking.cash') }, { value: 'bank', label: t('booking.bank') }, { value: 'corporate', label: t('booking.corporate') },
          ]} value={paymentMethod} />
          {conflict && <p className="quote-conflict" role="alert">{t('booking.reserveConflict')}</p>}
        </div>}
        </>}
      </div>

      {!paymentBooking && <footer className="booking-wizard__actions">
        <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} variant="secondary">{t('booking.back')}</Button>
        <Button disabled={createBooking.isPending || availableVehicles.isLoading || (step >= 3 && !quote)} onClick={() => void continueStep()}>
          {step === 4 ? t(createBooking.isPending ? 'booking.calculating' : 'booking.create') : t('booking.next')}
        </Button>
      </footer>}
    </section>
  )
}