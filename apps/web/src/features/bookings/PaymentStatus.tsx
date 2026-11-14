import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock3, RotateCw, Smartphone, XCircle } from 'lucide-react'
import { ApiError, apiClient } from '../../api/client'
import type { StkInitiation, StkStatus } from '../../api/types'
import { Button, PhoneInput } from '../../components/ui'
import { isKenyanPhone, maskKenyanPhone, normalisePhone } from '../../lib'

type PaymentState = 'idle' | 'waiting' | 'confirmed' | 'failed' | 'timeout' | 'manual_refund'

export function PaymentStatus({
  bookingId,
  amountDueKes,
  initialPhone = '',
  onConfirmed,
}: {
  bookingId: string
  amountDueKes: number
  initialPhone?: string
  onConfirmed?: () => void
}) {
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState(initialPhone)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [paymentState, setPaymentState] = useState<PaymentState>('idle')
  const [secondsRemaining, setSecondsRemaining] = useState(120)
  const [paidAmountKes, setPaidAmountKes] = useState<number | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const deadline = useRef(0)
  const pollInFlight = useRef(false)

  const applyStatus = useEffectEvent(async (id: string) => {
    if (pollInFlight.current) return
    pollInFlight.current = true
    try {
      const result = await apiClient.get<StkStatus>(`/payments/${encodeURIComponent(id)}/status`)
      setPaidAmountKes(result.paidAmountKes)
      if (result.outcome === 'confirmed') {
        setPaymentState('confirmed')
        setManualMessage(null)
        await queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
        await queryClient.invalidateQueries({ queryKey: ['bookings'] })
        onConfirmed?.()
      } else if (result.outcome === 'failed') {
        setPaymentState('failed')
        setError(result.message ?? 'The payment was not completed.')
      } else if (result.outcome === 'manual_refund') {
        setPaymentState('manual_refund')
        setError(result.message ?? 'This late payment was flagged for manual refund.')
      } else if (paymentState === 'timeout') {
        setManualMessage('The payment is still processing. Check again shortly.')
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Payment status is temporarily unavailable.')
    } finally {
      pollInFlight.current = false
    }
  })

  useEffect(() => {
    if (paymentState !== 'waiting' || !paymentId) return
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setSecondsRemaining(remaining)
      if (remaining === 0) {
        setPaymentState('timeout')
        return
      }
      if (remaining % 3 === 0) void applyStatus(paymentId)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [paymentId, paymentState])

  async function initiatePayment() {
    setError(null)
    setManualMessage(null)
    if (!isKenyanPhone(phone)) {
      setError('Enter a valid Kenyan mobile number, such as 0712 345 678 or 0112 345 678.')
      return
    }
    try {
      const result = await apiClient.post<StkInitiation>(`/bookings/${encodeURIComponent(bookingId)}/payments/stk`, {
        phone: normalisePhone(phone),
        amountKes: amountDueKes,
      })
      setPaymentId(result.paymentId)
      setMaskedPhone(result.maskedPhone || maskKenyanPhone(phone))
      deadline.current = Date.now() + 120_000
      setSecondsRemaining(120)
      setPaidAmountKes(undefined)
      setPaymentState('waiting')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not start the payment request.')
    }
  }

  async function checkManually() {
    if (!paymentId) return
    setManualMessage(null)
    await applyStatus(paymentId)
  }

  function retryPayment() {
    setPaymentId(null)
    setPaymentState('idle')
    setSecondsRemaining(120)
    setPaidAmountKes(undefined)
    setError(null)
    setManualMessage(null)
  }

  const amountMismatch = paymentState === 'confirmed' && paidAmountKes !== undefined && paidAmountKes !== amountDueKes

  return (
    <section aria-live="polite" className="payment-status" data-state={paymentState}>
      {paymentState === 'idle' && <>
        <div className="payment-status__heading"><Smartphone aria-hidden="true" size={20} /><div><h3>Pay by M-Pesa</h3><p>Amount due: KES {new Intl.NumberFormat('en-KE').format(amountDueKes)}</p></div></div>
        <PhoneInput error={error ?? undefined} label="M-Pesa phone number" onChange={setPhone} value={phone} />
        <Button disabled={!isKenyanPhone(phone)} onClick={() => void initiatePayment()}><Smartphone aria-hidden="true" size={17} /> Send payment request</Button>
      </>}
      {paymentState === 'waiting' && <div className="payment-status__state">
        <Clock3 aria-hidden="true" size={24} />
        <h3>Check your phone</h3>
        <p>Approve the M-Pesa request sent to <strong>{maskedPhone}</strong>.</p>
        <p className="payment-status__countdown">Checking for payment: {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}</p>
      </div>}
      {paymentState === 'confirmed' && <div className="payment-status__state">
        <CheckCircle2 aria-hidden="true" size={24} />
        <h3>Payment confirmed</h3>
        <p>API-confirmed payment for {maskedPhone}.</p>
        {amountMismatch && <p className="payment-status__warning" role="alert"><AlertTriangle aria-hidden="true" size={17} /> Paid amount differs from the amount due. Review before handover.</p>}
      </div>}
      {paymentState === 'failed' && <div className="payment-status__state">
        <XCircle aria-hidden="true" size={24} /><h3>Payment failed</h3><p>{error}</p>
        <Button onClick={retryPayment} variant="secondary"><RotateCw aria-hidden="true" size={17} /> Retry payment</Button>
      </div>}
      {paymentState === 'timeout' && <div className="payment-status__state">
        <Clock3 aria-hidden="true" size={24} /><h3>Payment status timed out</h3><p>We did not receive a final status. You can check again without starting another payment.</p>
        {manualMessage && <p role="status">{manualMessage}</p>}
        {error && <p className="field__error" role="alert">{error}</p>}
        <div className="payment-status__actions"><Button onClick={() => void checkManually()} variant="secondary">Check status</Button><Button onClick={retryPayment} variant="ghost"><RotateCw aria-hidden="true" size={17} /> Retry payment</Button></div>
      </div>}
      {paymentState === 'manual_refund' && <div className="payment-status__state">
        <AlertTriangle aria-hidden="true" size={24} /><h3>Payment flagged for manual refund</h3><p>{error} Contact an owner before handing over the vehicle.</p>
        <Button onClick={retryPayment} variant="secondary"><RotateCw aria-hidden="true" size={17} /> Try another payment</Button>
      </div>}
      {paymentState === 'idle' && error && <p className="field__error" role="alert">{error}</p>}
    </section>
  )
}