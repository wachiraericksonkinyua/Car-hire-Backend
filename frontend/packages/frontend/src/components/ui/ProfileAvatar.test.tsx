import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileAvatar } from './ProfileAvatar'

describe('profile avatar', () => {
  afterEach(cleanup)

  it('shows a name fallback when the image cannot be loaded', () => {
    render(
      <ProfileAvatar
        className="avatar"
        fallbackClassName="avatar avatar--placeholder"
        name="Asha Njeri"
        src="/missing-photo.png"
      />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'Asha Njeri profile' }))

    expect(screen.getByRole('img', { name: 'Asha Njeri profile image' })).toHaveTextContent('A')
  })
})
