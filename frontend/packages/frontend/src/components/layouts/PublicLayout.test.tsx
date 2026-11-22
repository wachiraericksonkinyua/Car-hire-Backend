import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PublicLayout } from './PublicLayout'

describe('public layout navigation', () => {
  afterEach(cleanup)

  it('opens and closes the mobile navigation', () => {
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route element={<PublicLayout />} path="/">
            <Route element={<p>Home</p>} index />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const menuButton = screen.getByRole('button')
    const navigation = container.querySelector('.public-nav')

    expect(navigation).not.toHaveClass('is-open')
    fireEvent.click(menuButton)
    expect(navigation).toHaveClass('is-open')
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(menuButton)
    expect(navigation).not.toHaveClass('is-open')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })
})
