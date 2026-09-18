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

New file added by Handicraft (not present upstream): a tier badge showing how
many distinct upstream channels serve a model, rendered beside the price in
the model square.

Only rendered when more than one channel is available. A single channel is the
unremarkable case, and a "1 tier" badge on most rows would be noise that
dilutes the signal for the rows that actually have alternatives.
--------------------------------------------------------------------------
*/
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'

import type { PricingModel } from '../types'

interface ModelTierBadgeProps {
  model: PricingModel
  className?: string
}

export function ModelTierBadge(props: ModelTierBadgeProps) {
  const { t } = useTranslation()
  // The backend counts distinct enabled channels across every group. Absent or
  // 1 means a single upstream, which is not worth surfacing.
  const tierCount = props.model.channel_count ?? 0

  if (tierCount <= 1) {
    return null
  }

  // Deliberately not the i18next `count` variable: that would engage plural
  // resolution, and the badge only ever renders for two or more tiers.
  const label = t('🔰 · {{n}} tiers', { n: tierCount })

  return (
    <StatusBadge
      label={label}
      variant='blue'
      size='sm'
      copyable={false}
      className={props.className}
    />
  )
}
