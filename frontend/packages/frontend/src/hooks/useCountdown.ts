import { useEffect, useRef, useState } from 'react'

type CountdownState = { secondsLeft: number; expired: boolean }

export function useCountdown(holdExpiresAt?: string, onExpire?: () => void): CountdownState {
  const [state, setState] = useState<CountdownState>({ secondsLeft: 0, expired: false })
  const onExpireRef = useRef(onExpire)
  const hasExpiredRef = useRef(false)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    hasExpiredRef.current = false
    if (!holdExpiresAt) return

    const expiresAt = Date.parse(holdExpiresAt)
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      const expired = secondsLeft === 0
      setState({ secondsLeft, expired })
      if (expired && !hasExpiredRef.current) {
        hasExpiredRef.current = true
        onExpireRef.current?.()
      }
      return !expired
    }

    if (!tick()) return
    const intervalId = window.setInterval(() => {
      if (!tick()) window.clearInterval(intervalId)
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [holdExpiresAt])

  return state
}