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
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { ModelTierBadge } from '../components/model-tier-badge'
import { formatChannelPrices, formatPrice } from '../lib/price'
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

  test('given no configured channel prices, hovering shows nothing extra', async () => {
    const user = userEvent.setup()
    render(<ModelTierBadge model={makeModel({ channel_count: 2 })} />)

    await user.hover(screen.getByText('🔰 · 2 tiers'))

    expect(screen.queryByText('Channel prices')).toBeNull()
  })

  test('given configured channel prices, hovering lists them cheapest first', async () => {
    const user = userEvent.setup()
    render(
      <ModelTierBadge
        model={makeModel({ channel_count: 2 })}
        prices={['¥1.50', '¥3.50']}
        priceUnitLabel='1M'
      />
    )

    await user.hover(screen.getByText('🔰 · 2 tiers'))

    expect(await screen.findByText('Channel prices')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '¥1.50/ 1M',
      '¥3.50/ 1M',
    ])
  })

  // Two channels charging the same amount are one price to a buyer; repeating
  // the row would read as a rendering glitch.
  test('given two channels at the same price, hovering lists it once', async () => {
    const user = userEvent.setup()
    render(
      <ModelTierBadge
        model={makeModel({ channel_count: 2 })}
        prices={['¥1.50', '¥1.50']}
        priceUnitLabel='1M'
      />
    )

    await user.hover(screen.getByText('🔰 · 2 tiers'))

    expect(await screen.findByText('Channel prices')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

// The tooltip is only useful if it agrees with the price it sits next to. A
// channel price is stored per 1M tokens, exactly like the model price, so both
// go through the same conversion; these pin that they cannot drift apart.
describe('formatChannelPrices', () => {
  test('a channel price equal to the model price formats identically to it', () => {
    // A ratio of 1 is 2 USD per 1M tokens.
    const model = makeModel({ model_ratio: 1, channel_prices: [2] })

    expect(formatChannelPrices(model, 'M')).toEqual([
      formatPrice(model, 'input', 'M'),
    ])
  })

  test('a channel price is quoted per 1M tokens, so half of it is that ratio', () => {
    const model = makeModel({ model_ratio: 1, channel_prices: [4] })

    expect(formatChannelPrices(model, 'M')).toEqual([
      formatPrice({ ...model, model_ratio: 2 }, 'input', 'M'),
    ])
  })

  test('the selected group ratio reaches the tooltip prices', () => {
    const model = makeModel({
      model_ratio: 1,
      channel_prices: [2],
      enable_groups: ['default', 'vip'],
      group_ratio: { default: 1, vip: 3 },
    })

    const [forDefault] = formatChannelPrices(model, 'M', false, 1, 1, 'default')
    const [forVip] = formatChannelPrices(model, 'M', false, 1, 1, 'vip')

    expect(forVip).not.toEqual(forDefault)
    expect(forVip).toEqual(
      formatPrice({ ...model, model_ratio: 1 }, 'input', 'M', false, 1, 1, 'vip')
    )
  })

  test('no configured channel price yields no prices', () => {
    expect(formatChannelPrices(makeModel(), 'M')).toEqual([])
    expect(formatChannelPrices(makeModel({ channel_prices: [] }), 'M')).toEqual(
      []
    )
  })
})
