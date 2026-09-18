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

New file added by Handicraft (not present upstream): the tier badge and the
price-tier panel behind it.

A model sold at more than one price — to different user groups, or coming from
different upstream channels — cannot be summarised by the single number in the
row. The badge says how many tiers exist ("起 · N 档", "from · N tiers") so the
row's price reads as the cheapest one, and hovering it opens a panel listing
every tier with its input and output price per 1M tokens.

Only rendered when more than one tier exists. One price is the unremarkable
case, and a "1 tier" badge on most rows would be noise that dilutes the signal
for the rows that actually have alternatives.

Tier rows carry no channel identity: this renders on the anonymous pricing
page, and naming the upstreams a site resells would leak its supply chain.
Group names do appear, because they are the site's own and are what tells a
buyer which price is theirs.
--------------------------------------------------------------------------
*/
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { PriceTiers } from '../lib/price-tiers'
import type { PricingModel } from '../types'

interface ModelTierBadgeProps {
  model: PricingModel
  /** The model's price tiers, cheapest first. */
  tiers: PriceTiers
  /** Token unit the tier prices are quoted per, e.g. "1M". */
  priceUnitLabel: string
  className?: string
}

export function ModelTierBadge(props: ModelTierBadgeProps) {
  const { t } = useTranslation()

  if (props.tiers.tiers.length <= 1) {
    return null
  }

  // Deliberately not the i18next `count` variable: that would engage plural
  // resolution, and the badge only ever renders for two or more tiers.
  const label = t('起 · {{n}} 档', { n: props.tiers.tiers.length })
  const badge = (
    <StatusBadge
      label={label}
      variant='blue'
      size='sm'
      copyable={false}
      className={props.className}
    />
  )

  const subtitle =
    props.tiers.source === 'channel'
      ? t('Input / output price per 1M tokens for each channel')
      : t('Input / output price per 1M tokens for each group')

  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger render={<span className='inline-flex' />}>
          {badge}
        </TooltipTrigger>
        <TooltipContent
          side='top'
          align='start'
          className='border-border bg-popover text-popover-foreground w-72 flex-col items-stretch gap-0 p-0'
        >
          <div className='space-y-0.5 border-b px-3 py-2'>
            <div className='truncate font-medium'>{props.model.model_name}</div>
            <div className='text-muted-foreground text-[10px] leading-tight'>
              {subtitle}
            </div>
          </div>

          <ul className='divide-y'>
            {props.tiers.tiers.map((tier) => (
              <li
                key={tier.key}
                className='flex items-center justify-between gap-3 px-3 py-2'
              >
                <span className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  {tier.label}
                </span>
                <span className='shrink-0 font-mono text-xs tabular-nums'>
                  <span className='text-muted-foreground'>
                    {t('Input')}{' '}
                  </span>
                  {tier.input}
                  <span className='text-muted-foreground mx-1'>·</span>
                  <span className='text-muted-foreground'>
                    {t('Output')}{' '}
                  </span>
                  {tier.output}
                </span>
              </li>
            ))}
          </ul>

          <div className='text-muted-foreground border-t px-3 py-2 text-[10px] leading-tight'>
            {t('Always billed at the cheapest tier that has this model.')}
            <span className='ml-1'>/ {props.priceUnitLabel}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
