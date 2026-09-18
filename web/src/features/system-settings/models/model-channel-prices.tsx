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

New file added by Handicraft (not present upstream): the per-channel price
editor shown for a model inside the pricing panel.

Two channels can serve the same model at different prices. Editing them here
means the model's own price stays the default and each channel can undercut or
exceed it.

Saving writes the whole model -> channel -> price map back as one option,
because that is how the backend stores it. The in-flight map is seeded from the
server response rather than rebuilt from scratch, so editing one model never
drops the prices configured for the others.
--------------------------------------------------------------------------
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'

import { getModelChannels, updateSystemOption } from '../api'

/** Backend option key for the whole model -> channel -> price map. */
const CHANNEL_PRICE_OPTION_KEY = 'channel_pricing_setting.channel_model_price'

type ModelChannelPricesProps = {
  modelName: string
}

export function ModelChannelPrices(props: ModelChannelPricesProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  const query = useQuery({
    queryKey: ['model-channels'],
    queryFn: getModelChannels,
    staleTime: 30 * 1000,
  })

  const channels = query.data?.data?.model_channels?.[props.modelName] ?? []
  const savedForModel =
    query.data?.data?.channel_prices?.[props.modelName] ?? {}

  // Seed the inputs from the server once, and again whenever the selected model
  // changes. Deriving them on every render would fight the user's typing.
  useEffect(() => {
    const next: Record<number, string> = {}
    for (const channel of channels) {
      const saved = savedForModel[String(channel.channel_id)]
      next[channel.channel_id] = saved === undefined ? '' : String(saved)
    }
    setDrafts(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, props.modelName])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const all = { ...query.data?.data?.channel_prices }
      const forModel: Record<string, number> = {}

      for (const channel of channels) {
        const raw = (drafts[channel.channel_id] ?? '').trim()
        if (raw === '') continue

        const parsed = Number(raw)
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(
            t('Price for {{channel}} must be a non-negative number.', {
              channel: channel.channel_name || `#${channel.channel_id}`,
            })
          )
        }
        forModel[String(channel.channel_id)] = parsed
      }

      if (Object.keys(forModel).length === 0) {
        delete all[props.modelName]
      } else {
        all[props.modelName] = forModel
      }

      const res = await updateSystemOption({
        key: CHANNEL_PRICE_OPTION_KEY,
        value: JSON.stringify(all),
      })
      if (!res.success) {
        throw new Error(res.message || t('Failed to save'))
      }
      return res
    },
    onSuccess: () => {
      toast.success(t('Channel prices saved'))
      void queryClient.invalidateQueries({ queryKey: ['model-channels'] })
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('Failed to save'))
    },
  })

  if (query.isLoading) {
    return (
      <div className='space-y-2'>
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    )
  }

  if (query.isError) {
    return (
      <p className='text-destructive text-sm'>
        {t('Failed to load the channels serving this model.')}
      </p>
    )
  }

  if (channels.length < 2) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t(
          'Only one channel serves this model, so there is no per-channel price to set.'
        )}
      </p>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <p className='text-sm font-medium'>{props.modelName}</p>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Price per 1M tokens on each channel. Leave a field empty so that channel falls back to the model price.'
          )}
        </p>
      </div>

      <div className='divide-border rounded-lg border'>
        {channels.map((channel) => {
          const inputId = `channel-price-${channel.channel_id}`

          return (
            <div
              key={channel.channel_id}
              className='flex flex-wrap items-center gap-3 border-b p-3 last:border-b-0'
            >
              <div className='min-w-0 flex-1'>
                <label
                  htmlFor={inputId}
                  className='block truncate text-sm font-medium'
                >
                  {channel.channel_name || `#${channel.channel_id}`}
                </label>
                <div className='text-muted-foreground truncate text-xs'>
                  #{channel.channel_id}
                  {channel.groups.length > 0
                    ? ` · ${t('Group')}: ${channel.groups.join(', ')}`
                    : ''}
                </div>
              </div>

              <div className='w-44 shrink-0'>
                <InputGroup>
                  <InputGroupAddon>$</InputGroupAddon>
                  <InputGroupInput
                    id={inputId}
                    inputMode='decimal'
                    placeholder={t('Inherit')}
                    value={drafts[channel.channel_id] ?? ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [channel.channel_id]: event.target.value,
                      }))
                    }
                  />
                  <InputGroupAddon align='inline-end'>/1M</InputGroupAddon>
                </InputGroup>
              </div>
            </div>
          )
        })}
      </div>

      <Button
        type='button'
        size='sm'
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <Loader2 data-icon='inline-start' className='animate-spin' />
        ) : (
          <Save data-icon='inline-start' />
        )}
        {saveMutation.isPending
          ? t('Saving...')
          : t('Save channel prices')}
      </Button>
    </div>
  )
}
