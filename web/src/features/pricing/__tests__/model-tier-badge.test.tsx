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

New file added by Handicraft: regression tests for the model tier badge.

The badge's contract is which counts are worth showing: anything above one
channel gets a badge, and the single-channel case — by far the most common —
must stay silent so the badge keeps meaning something.
--------------------------------------------------------------------------
*/
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ModelTierBadge } from '../components/model-tier-badge'
import type { PricingModel } from '../types'

function makeModel(overrides?: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'ds-v4.1-flash',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

describe('ModelTierBadge', () => {
  test('given a single channel, no badge is rendered', () => {
    const { container } = render(<ModelTierBadge model={makeModel({ channel_count: 1 })} />)

    expect(container).toBeEmptyDOMElement()
  })

  test('given zero channels, no badge is rendered', () => {
    const { container } = render(<ModelTierBadge model={makeModel({ channel_count: 0 })} />)

    expect(container).toBeEmptyDOMElement()
  })

  test('given the backend omits the count, no badge is rendered', () => {
    const { container } = render(<ModelTierBadge model={makeModel()} />)

    expect(container).toBeEmptyDOMElement()
  })

  test('given two channels, the badge reports two tiers', () => {
    render(<ModelTierBadge model={makeModel({ channel_count: 2 })} />)

    expect(screen.getByText('🔰 · 2 tiers')).toBeInTheDocument()
  })

  test('given more than two channels, the badge reports the exact count', () => {
    render(<ModelTierBadge model={makeModel({ channel_count: 5 })} />)

    expect(screen.getByText('🔰 · 5 tiers')).toBeInTheDocument()
    expect(screen.queryByText('🔰 · 2 tiers')).toBeNull()
  })

  test('given a badge, it stays inert so it cannot be mistaken for a copyable field', () => {
    render(<ModelTierBadge model={makeModel({ channel_count: 3 })} />)

    const badge = screen.getByText('🔰 · 3 tiers')
    // A copyable StatusBadge would advertise itself through its title.
    expect(badge.closest('[title]')?.getAttribute('title')).not.toMatch(/copy/i)
  })
})
