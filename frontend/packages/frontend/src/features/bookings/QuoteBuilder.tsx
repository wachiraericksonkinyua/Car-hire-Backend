import { useEffect, useMemo, useRef, useState } from 'react'
import type { DriveMode, DriverLocation, QuoteRequest, QuoteResponse } from '../../api/types'
import { useCalculateQuote } from '../../api/queries'
import { Button, Checkbox, DateTimeRangePicker, Input, Select, Tabs } from '../../components/ui'
import { formatKes } from '../../lib'
import { t } from '../../i18n'

const extraOptions = [
  { code: 'baby_seat', label: 'booking.babySeat' },
  { code: 'rooftop_tent', label: 'booking.rooftopTent' },
  { code: 'cooler_box', label: 'booking.coolerBox' },
  { code: 'airport_pickup', label: 'booking.airportPickup' },
]

const extrasLabels: Record<string, string> = Object.fromEntries(extraOptions.map(({ code, label }) => [code, label]))

type QuoteBuilderProps = {
  request: QuoteRequest
  onChange: (request: QuoteRequest) => void
  showDates?: boolean
  showPickupLocation?: boolean
  showModeAndExtras?: boolean
  onReserve?: (request: QuoteRequest, quote: QuoteResponse) => void
  onQuoteChange?: (quote: QuoteResponse | null) => void
  reserveDisabled?: boolean
  conflictMessage?: string
}

export function QuoteBuilder({
  request,
  onChange,
  showDates = true,
  showPickupLocation = true,
  showModeAndExtras = true,
  onReserve,
  onQuoteChange,
  reserveDisabled = false,
  conflictMessage,
}: QuoteBuilderProps) {
  const { isPending, mutateAsync } = useCalculateQuote()
  const [quoted, setQuoted] = useState<{ requestKey: string; quote: QuoteResponse } | null>(null)
  const [errorRequestKey, setErrorRequestKey] = useState<string | null>(null)
  const latestRequestKey = useRef('')
  const requestKey = JSON.stringify(request)
  const requestPayload = useMemo(() => JSON.parse(requestKey) as QuoteRequest, [requestKey])
  const canQuote = Boolean(request.vehicleId && request.pickupAt && request.returnAt && request.pickupLocation.trim())
  const currentQuote = quoted?.requestKey === requestKey ? quoted.quote : undefined
  const error = errorRequestKey === requestKey

  useEffect(() => {
    onQuoteChange?.(currentQuote ?? null)
  }, [currentQuote, onQuoteChange])

  useEffect(() => {
    if (!canQuote) return
    const timerId = window.setTimeout(() => {
      latestRequestKey.current = requestKey
      mutateAsync(requestPayload).then((quote) => {
        if (latestRequestKey.current === requestKey) {
          setQuoted({ requestKey, quote })
          setErrorRequestKey(null)
        }
      }).catch(() => {
        if (latestRequestKey.current === requestKey) setErrorRequestKey(requestKey)
      })
    }, 300)
    return () => window.clearTimeout(timerId)
  }, [canQuote, requestKey, requestPayload, mutateAsync])

  function update(patch: Partial<QuoteRequest>) {
    onChange({ ...request, ...patch })
  }

  function toggleExtra(code: string, checked: boolean) {
    update({ extras: checked ? [...request.extras, code] : request.extras.filter((item) => item !== code) })
  }

  return (
    <section aria-labelledby="quote-builder-title" className="quote-builder">
      <h2 id="quote-builder-title">{t('booking.quoteBreakdown')}</h2>
      {showDates && <DateTimeRangePicker endUtc={request.returnAt} label={t('booking.dateRange')} onChange={(range) => update({ pickupAt: range.startUtc, returnAt: range.endUtc })} startUtc={request.pickupAt} />}
      {showPickupLocation && <Input label={t('booking.pickupLocation')} onChange={(event) => update({ pickupLocation: event.target.value })} placeholder={t('booking.pickupPlaceholder')} value={request.pickupLocation} />}
      {showModeAndExtras && <>
        <Tabs
          label={t('booking.driveMode')}
          onChange={(value) => update({ mode: value as DriveMode })}
          options={[{ value: 'self_drive', label: t('booking.selfDrive') }, { value: 'chauffeur', label: t('booking.chauffeur') }]}
          value={request.mode}
        />
        {request.mode === 'chauffeur' && <Select
          label="Driver fee area"
          onChange={(event) => update({ driverLocation: event.target.value as DriverLocation })}
          options={[{ value: 'in_town', label: 'In-town' }, { value: 'upcountry', label: 'Upcountry' }]}
          value={request.driverLocation ?? 'in_town'}
        />}
        <fieldset className="quote-extras">
          <legend>{t('booking.extras')}</legend>
          {extraOptions.map(({ code, label }) => <Checkbox checked={request.extras.includes(code)} key={code} label={t(label)} onChange={(checked) => toggleExtra(code, checked)} />)}
        </fieldset>
      </>}

      {isPending && canQuote && <p aria-live="polite" className="quote-calculating">{t('booking.calculating')}</p>}
      {error && <p className="field__error" role="alert">{t('booking.quoteError')}</p>}
      {conflictMessage && <p className="quote-conflict" role="alert">{conflictMessage}</p>}
      {currentQuote && <QuoteBreakdown quote={currentQuote} />}
      {onReserve && <Button disabled={reserveDisabled || !currentQuote} onClick={() => currentQuote && onReserve(request, currentQuote)}>{t('booking.reserve')}</Button>}
    </section>
  )
}

export function QuoteBreakdown({ quote }: { quote: QuoteResponse }) {
  const snapshot = quote.pricingSnapshot
  const chauffeurFeeLabel = snapshot.driverLocation === 'upcountry' ? 'Upcountry driver fee' : 'In-town driver fee'
  return (
    <dl className="quote-breakdown">
      <div><dt>{t('booking.baseDays').replace('{days}', String(snapshot.baseDays))}</dt><dd>{formatKes(snapshot.baseAmountKes)}</dd></div>
      {snapshot.chauffeurFeeKes > 0 && <div><dt>{chauffeurFeeLabel}</dt><dd>{formatKes(snapshot.chauffeurFeeKes)}</dd></div>}
      {snapshot.extras.map((extra) => <div key={extra.code}><dt>{t(extrasLabels[extra.code] ?? extra.label)}</dt><dd>{formatKes(extra.amountKes)}</dd></div>)}
      <div><dt>{t('booking.vat').replace('{rate}', String(snapshot.vatRate))}</dt><dd>{formatKes(snapshot.vatAmountKes)}</dd></div>
      <div className="quote-breakdown__total"><dt>{t('booking.totalDue')}</dt><dd>{formatKes(snapshot.totalDueKes)}</dd></div>
      <div className="quote-breakdown__deposit"><dt>{t('booking.refundableDeposit')} <span>{t('booking.depositUntaxed')}</span></dt><dd>{formatKes(snapshot.refundableDepositKes)}</dd></div>
    </dl>
  )
}