import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOSButton } from './SOSButton'

vi.mock('./GeoMap', () => ({ GeoMap: () => <div aria-label="Incident location map" /> }))

const geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation')

afterEach(() => {
  if (geolocationDescriptor) Object.defineProperty(navigator, 'geolocation', geolocationDescriptor)
  else Reflect.deleteProperty(navigator, 'geolocation')
})

describe('SOS location fallback', () => {
  it('shows typed location and call-desk fallback when GPS is denied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) },
    })
    const queryClient = new QueryClient()
    const user = userEvent.setup()
    render(<QueryClientProvider client={queryClient}><SOSButton source="driver" vehicleId="car-01" /></QueryClientProvider>)
    await user.click(screen.getByRole('button', { name: 'SOS' }))
    expect(await screen.findByText(/GPS location unavailable/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Location or landmark')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call the desk/i })).toHaveAttribute('href', 'tel:+254700123456')
  })
})