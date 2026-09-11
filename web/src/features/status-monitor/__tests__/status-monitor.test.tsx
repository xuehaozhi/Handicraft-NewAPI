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

New file added by Handicraft: regression tests for the /status-monitor page.
The access-control test is the important one: it pins the contract that an
anonymous visitor must never trigger the metrics request.
--------------------------------------------------------------------------
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { getStatusMonitor } from '../api'
import { StatusMonitor } from '../index'
import type { StatusMonitorPayload } from '../types'

vi.mock('../api', () => ({ getStatusMonitor: vi.fn() }))

// <Link> needs a live router context, which this unit test has no reason to
// stand up. The page only needs it to render an anchor for the sign-in prompt.
vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to?: unknown; children?: React.ReactNode }) => (
    <a href={typeof props.to === 'string' ? props.to : '#'}>{props.children}</a>
  ),
}))

// PublicLayout brings in router context, the header chrome and the nav-link
// hook, none of which the page's own contract depends on.
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
}))

const mockedGetStatusMonitor = vi.mocked(getStatusMonitor)

const GIB = 1024 ** 3

function makePayload(
  overrides?: Partial<StatusMonitorPayload>
): StatusMonitorPayload {
  return {
    server: {
      cpu_percent: 42.5,
      cpu_count: 8,
      memory_used: 8 * GIB,
      memory_total: 16 * GIB,
      memory_percent: 50,
      disk_used: 100 * GIB,
      disk_total: 200 * GIB,
      disk_percent: 50,
      network_sent: GIB,
      network_recv: 2 * GIB,
      network_out_rate: 2048,
      network_in_rate: 4096,
      uptime_seconds: 3661,
      goroutines: 42,
      go_mem_alloc: 1024 ** 2,
      go_version: 'go1.27.1',
      collected_at: 1789124079,
    },
    usage: {
      total_requests: 12345,
      total_tokens: 987654321,
      total_quota: 5000000,
    },
    ...overrides,
  }
}

function signIn(): void {
  const user: AuthUser = { id: 1, username: 'thinkrain', role: 1 }
  useAuthStore.getState().auth.setUser(user)
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StatusMonitor />
    </QueryClientProvider>
  )
}

describe('StatusMonitor', () => {
  beforeEach(() => {
    useAuthStore.getState().auth.reset()
  })

  afterEach(() => {
    useAuthStore.getState().auth.reset()
  })

  test('given an anonymous visitor, the sign-in prompt is shown and no metrics request is made', async () => {
    renderPage()

    expect(
      screen.getByText('Sign in to view the status monitor')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument()

    // The page must not fetch, and must not leak any metric even if a cached
    // response were somehow available.
    expect(mockedGetStatusMonitor).not.toHaveBeenCalled()
    expect(screen.queryByText('CPU Usage')).toBeNull()
    expect(screen.queryByText('Total Requests')).toBeNull()
  })

  test('given a signed-in user, host resource metrics are rendered with their units', async () => {
    mockedGetStatusMonitor.mockResolvedValue(makePayload())
    signIn()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument()
    })

    expect(screen.getByText('42.5%')).toBeInTheDocument()
    expect(screen.getByText('8.00 GB of 16.0 GB')).toBeInTheDocument()
    expect(screen.getByText('100 GB of 200 GB')).toBeInTheDocument()
    expect(screen.getByText('2.00 KB/s')).toBeInTheDocument()
    expect(screen.getByText('4.00 KB/s')).toBeInTheDocument()
    expect(screen.getByText('8 cores')).toBeInTheDocument()
  })

  test('given a signed-in user, platform-wide totals are rendered', async () => {
    mockedGetStatusMonitor.mockResolvedValue(makePayload())
    signIn()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Platform Totals')).toBeInTheDocument()
    })

    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('Total Requests')).toBeInTheDocument()
    expect(screen.getByText('Total Quota Used')).toBeInTheDocument()
  })

  test('given the usage aggregate is unavailable, server metrics still render alongside a notice', async () => {
    mockedGetStatusMonitor.mockResolvedValue(makePayload({ usage: null }))
    signIn()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Platform totals are temporarily unavailable.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Total Requests')).toBeNull()
  })

  test('given the request fails, an error state with a retry action replaces the metrics', async () => {
    mockedGetStatusMonitor.mockRejectedValue(new Error('network down'))
    signIn()

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText('Unable to load status monitor data.')
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('CPU Usage')).toBeNull()
  })

  test('given the page renders, the heading block clears the fixed header instead of sliding under it', () => {
    renderPage()

    // PublicLayout applies no top padding when showMainContainer is false, so
    // the page must supply it. Regression guard: without it the heading renders
    // on top of the site brand in the fixed header (h-16 == 4rem).
    // Matched by name because the anonymous state also renders an h1.
    const headingBlock = screen
      .getByRole('heading', { level: 1, name: 'Status Monitor' })
      .closest('header')
    expect(headingBlock).not.toBeNull()
    expect(headingBlock?.parentElement).toHaveClass('pt-20')
  })
})
