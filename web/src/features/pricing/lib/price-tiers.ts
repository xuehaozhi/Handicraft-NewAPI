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

New file added by Handicraft (not present upstream): the price tiers ("档位")
a model can be bought at.

A model reachable at more than one price cannot be summarised by a single
number, so the model square shows the cheapest one and says how many tiers
exist — "起 · N 档". This module works out what those tiers are.

Tiers come from two places, in this order:

  - groups. The same model is deliberately sold at different prices to
    different user groups, which is the ordinary case on a reseller site.
  - channels. When a model is in only one group there is no group dimension,
    so the per-channel prices the operator configured are the only tiers
    there are.

Every price here is produced by the same formatters the row's own price uses,
so the panel and the row cannot disagree about currency, token unit, recharge
rate or token unit.
--------------------------------------------------------------------------
*/
import type { PricingModel, TokenUnit } from '../types'
import { getConfiguredGroupRatio } from './model-helpers'
import { formatGroupPrice, formatPrice } from './price'

export type PriceTier = {
  /** Stable key for React lists. */
  key: string
  /**
   * What distinguishes this tier: the group name(s) that have it, or nothing
   * when the price itself is the only difference.
   */
  label: string
  /** Formatted price per 1M input tokens. */
  input: string
  /** Formatted price per 1M output tokens. */
  output: string
}

export type PriceTiers = {
  /** Where the tiers came from, which decides the panel's wording. */
  source: 'group' | 'channel' | 'none'
  /** Tiers, cheapest first. Empty when the model has only one price. */
  tiers: PriceTier[]
}

export type PriceTierOptions = {
  tokenUnit: TokenUnit
  showWithRecharge?: boolean
  priceRate?: number
  usdExchangeRate?: number
  selectedGroup?: string
}

/**
 * Work out the price tiers of a model, cheapest first.
 *
 * Returns an empty list when the model has a single price, because a "1 tier"
 * badge on almost every row would be noise that drowns out the rows that
 * genuinely have alternatives.
 */
export function getPriceTiers(
  model: PricingModel,
  options: PriceTierOptions
): PriceTiers {
  const byGroup = groupTiers(model, options)
  if (byGroup.length > 1) {
    return { source: 'group', tiers: byGroup }
  }

  const byChannel = channelTiers(model, options)
  if (byChannel.length > 1) {
    return { source: 'channel', tiers: byChannel }
  }

  return { source: 'none', tiers: [] }
}

/**
 * One tier per distinct group ratio. Groups that share a ratio are charged
 * exactly the same, so they are one tier as far as a buyer is concerned and
 * collapse into a single row labelled with every group that has it.
 *
 * Keyed and ordered by the ratio rather than by the formatted string, because
 * the ratio is what actually drives the price and sorting formatted currency
 * text would order it wrong.
 */
function groupTiers(
  model: PricingModel,
  options: PriceTierOptions
): PriceTier[] {
  const groups = model.enable_groups ?? []
  if (groups.length < 2) return []

  const groupRatio = model.group_ratio ?? {}
  const byRatio = new Map<number, string[]>()
  for (const group of groups) {
    const ratio = getConfiguredGroupRatio(groupRatio, group)
    const names = byRatio.get(ratio)
    if (names) {
      names.push(group)
    } else {
      byRatio.set(ratio, [group])
    }
  }

  return [...byRatio.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ratio, names]) => ({
      key: `group-${ratio}`,
      label: names.join(' / '),
      input: formatGroupPrice(
        model,
        names[0],
        'input',
        options.tokenUnit,
        options.showWithRecharge,
        options.priceRate,
        options.usdExchangeRate,
        groupRatio
      ),
      output: formatGroupPrice(
        model,
        names[0],
        'output',
        options.tokenUnit,
        options.showWithRecharge,
        options.priceRate,
        options.usdExchangeRate,
        groupRatio
      ),
    }))
}

/**
 * One tier per configured per-channel price. Channels carry no name here on
 * purpose: this renders on the anonymous pricing page, and naming the upstreams
 * a site resells would leak its supply chain.
 *
 * A per-channel price is quoted per 1M input tokens, and the model price beside
 * the badge is a ratio of R meaning 2R USD per 1M tokens, so feeding the price
 * back as the ratio R / 2 makes the shared formatter reproduce the group ratio,
 * recharge rate, currency and token unit the row already applied.
 */
function channelTiers(
  model: PricingModel,
  options: PriceTierOptions
): PriceTier[] {
  const prices = [...new Set(model.channel_prices ?? [])].sort((a, b) => a - b)
  if (prices.length < 2) return []

  const format = (price: number, type: 'input' | 'output') =>
    formatPrice(
      { ...model, model_ratio: price / 2, quota_type: 0 },
      type,
      options.tokenUnit,
      options.showWithRecharge,
      options.priceRate,
      options.usdExchangeRate,
      options.selectedGroup
    )

  return prices.map((price) => ({
    key: `channel-${price}`,
    label: '',
    input: format(price, 'input'),
    output: format(price, 'output'),
  }))
}
