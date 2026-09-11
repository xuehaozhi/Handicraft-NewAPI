/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com

--------------------------------------------------------------------------
Modifications for Handicraft — 2026-09-11

New file added by Handicraft: regression tests protecting the dashboard
welcome banner's greeting contract, brand lockup, and accessibility wiring.
--------------------------------------------------------------------------
*/
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { WelcomeBanner } from '../welcome-banner'

const BRAND_LOCKUP = 'Handicraft · 手工API'

function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 1,
    username: 'thinkrain',
    role: 1,
    ...overrides,
  }
}

function getGreetingHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 2 })
}

describe('WelcomeBanner', () => {
  beforeEach(() => {
    useAuthStore.getState().auth.setUser(makeUser())
  })

  afterEach(() => {
    // The store is a module-level singleton shared across test files.
    useAuthStore.getState().auth.reset()
  })

  test('given a user with a display name, the greeting addresses the display name rather than the login name', () => {
    useAuthStore
      .getState()
      .auth.setUser(makeUser({ username: 'thinkrain', display_name: 'Handy' }))

    render(<WelcomeBanner />)

    const heading = getGreetingHeading()
    expect(heading).toHaveTextContent('Handy')
    expect(heading).not.toHaveTextContent('thinkrain')
  })

  test('given a user without a display name, the greeting falls back to the login name', () => {
    useAuthStore.getState().auth.setUser(makeUser({ username: 'thinkrain' }))

    render(<WelcomeBanner />)

    expect(getGreetingHeading()).toHaveTextContent('thinkrain')
  })

  test('given a user whose name is only whitespace, the greeting omits the name instead of rendering a dangling separator', () => {
    useAuthStore
      .getState()
      .auth.setUser(makeUser({ username: '   ', display_name: '   ' }))

    render(<WelcomeBanner />)

    const heading = getGreetingHeading()
    expect(heading.textContent?.trim()).toBe('Welcome back')
    expect(heading.textContent).not.toContain(',')
  })

  test('given no signed-in user, the greeting still renders the generic welcome', () => {
    useAuthStore.getState().auth.reset()

    render(<WelcomeBanner />)

    expect(getGreetingHeading().textContent?.trim()).toBe('Welcome back')
  })

  test('given the banner renders, the Handicraft brand lockup is always present above the greeting', () => {
    render(<WelcomeBanner />)

    const brand = screen.getByText(BRAND_LOCKUP)
    const heading = getGreetingHeading()
    expect(
      brand.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  test('given the banner renders, it is exposed as a region named by its greeting heading', () => {
    render(<WelcomeBanner />)

    const heading = getGreetingHeading()
    const region = screen.getByRole('region', { name: heading.textContent ?? '' })
    expect(region).toHaveAttribute('aria-labelledby', heading.id)
  })

  test('given the banner renders, the strip keeps a minimum height and clips decorative layers', () => {
    render(<WelcomeBanner />)

    const region = screen.getByRole('region')
    expect(region).toHaveClass('overflow-hidden')
    expect(getGreetingHeading().parentElement).toHaveClass('min-h-28')
  })
})
