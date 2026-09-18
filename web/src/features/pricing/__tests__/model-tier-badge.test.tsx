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

New file added by Handicraft: regression tests for the price-tier badge and
the tier panel behind it.

Two contracts are load-bearing here:

  - the badge only appears when a model really is sold at more than one price,
    so it keeps meaning something;
  - a tier's price is produced by the same formatter as the row's own price, so
    the panel can never quote a different number for the same tier.
--------------------------------------------------------------------------
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { ModelTierBadge } from '../components/model-tier-badge'
import { getPriceTiers } from '../lib/price-tiers'
import { formatPrice } from '../lib/price'
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

const THREE_GROUPS = makeModel({
  enable_groups: ['vip', 'default', 'free'],
  group_ratio: { free: 0, default: 1, vip: 3 },
})

describe('getPriceTiers', () => {
  test('a model sold in one group at one price has no tiers', () => {
    expect(getPriceTiers(makeModel(), { tokenUnit: 'M' })).toEqual({
      source: 'none',
      tiers: [],
    })
  })

  test('a model sold to several groups gets one tier per distinct ratio, cheapest first', () => {
    const { source, tiers } = getPriceTiers(THREE_GROUPS, { tokenUnit: 'M' })

    expect(source).toBe('group')
    expect(tiers.map((tier) => tier.label)).toEqual(['free', 'default', 'vip'])
  })

  // Two groups charged the same are one price to a buyer; two identical rows
  // would read as a rendering glitch.
  test('groups sharing a ratio collapse into one tier', () => {
    const model = makeModel({
      enable_groups: ['a', 'b'],
      group_ratio: { a: 2, b: 2 },
    })

    expect(getPriceTiers(model, { tokenUnit: 'M' }).tiers).toEqual([])
  })

  test('a tier is priced exactly as the row prices it', () => {
    const { tiers } = getPriceTiers(THREE_GROUPS, { tokenUnit: 'M' })

    const vip = tiers.find((tier) => tier.label === 'vip')
    expect(vip?.input).toBe(
      formatPrice(THREE_GROUPS, 'input', 'M', false, 1, 1, 'vip')
    )
    expect(vip?.output).toBe(
      formatPrice(THREE_GROUPS, 'output', 'M', false, 1, 1, 'vip')
    )
  })

  // With a single group there is no group dimension, so the per-channel prices
  // the operator configured are the only tiers there are.
  test('a single-group model falls back to its configured channel prices', () => {
    const model = makeModel({ channel_prices: [3.5, 1.5] })

    const { source, tiers } = getPriceTiers(model, { tokenUnit: 'M' })

    expect(source).toBe('channel')
    expect(tiers).toHaveLength(2)
    // A per-channel price is quoted per 1M input tokens, so a price of P is the
    // model ratio P / 2.
    expect(tiers[0].input).toBe(
      formatPrice(
        { ...model, model_ratio: 0.75, quota_type: 0 },
        'input',
        'M',
        false,
        1,
        1,
        undefined
      )
    )
    expect(tiers[1].input).toBe(
      formatPrice(
        { ...model, model_ratio: 1.75, quota_type: 0 },
        'input',
        'M',
        false,
        1,
        1,
        undefined
      )
    )
  })

  test('two channels at the same price are one tier', () => {
    const model = makeModel({ channel_prices: [1.5, 1.5] })

    expect(getPriceTiers(model, { tokenUnit: 'M' }).tiers).toEqual([])
  })

  test('groups win over channels when a model is sold to several groups', () => {
    const model = makeModel({
      enable_groups: ['a', 'b'],
      group_ratio: { a: 1, b: 2 },
      channel_prices: [1.5, 3.5],
    })

    expect(getPriceTiers(model, { tokenUnit: 'M' }).source).toBe('group')
  })
})

describe('ModelTierBadge', () => {
  function renderBadge(model: PricingModel) {
    return render(
      <ModelTierBadge
        model={model}
        tiers={getPriceTiers(model, { tokenUnit: 'M' })}
        priceUnitLabel='1M'
      />
    )
  }

  test('given one price, no badge is rendered', () => {
    const { container } = renderBadge(makeModel())

    expect(container).toBeEmptyDOMElement()
  })

  test('given several group tiers, the badge says the price starts there', () => {
    renderBadge(THREE_GROUPS)

    expect(screen.getByText('起 · 3 档')).toBeInTheDocument()
  })

  test('given a single tier, no badge is rendered', () => {
    const model = makeModel({
      enable_groups: ['a', 'b'],
      group_ratio: { a: 2, b: 2 },
    })
    const { container } = renderBadge(model)

    expect(container).toBeEmptyDOMElement()
  })

  test('hovering lists every tier with its input and output price', async () => {
    const user = userEvent.setup()
    renderBadge(THREE_GROUPS)

    await user.hover(screen.getByText('起 · 3 档'))

    expect(
      await screen.findByText(
        'Input / output price per 1M tokens for each group'
      )
    ).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      'free',
      'default',
      'vip',
    ])
    for (const row of rows) {
      expect(row.textContent).toContain('Input ')
      expect(row.textContent).toContain('Output ')
    }
  })

  test('the panel names the channel dimension when that is what the tiers are', async () => {
    const user = userEvent.setup()
    renderBadge(makeModel({ channel_prices: [1.5, 3.5] }))

    await user.hover(screen.getByText('起 · 2 档'))

    expect(
      await screen.findByText(
        'Input / output price per 1M tokens for each channel'
      )
    ).toBeInTheDocument()
  })

  test('the panel is titled with the model it describes', async () => {
    const user = userEvent.setup()
    renderBadge(THREE_GROUPS)

    await user.hover(screen.getByText('起 · 3 档'))

    expect(await screen.findByText('ds-v4.1-flash')).toBeInTheDocument()
  })

  test('the panel states the billing rule', async () => {
    const user = userEvent.setup()
    renderBadge(THREE_GROUPS)

    await user.hover(screen.getByText('起 · 3 档'))

    expect(
      await screen.findByText(/cheapest tier that has this model/)
    ).toBeInTheDocument()
  })
})
