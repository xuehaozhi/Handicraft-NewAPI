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

Regression tests for the per-channel price editor.
--------------------------------------------------------------------------
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { toast } from 'sonner'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import { ModelChannelPrices } from '../model-channel-prices'

const getModelChannels = vi.fn()
const updateSystemOption = vi.fn()

vi.mock('../../api', () => ({
  getModelChannels: () => getModelChannels(),
  updateSystemOption: (request: unknown) => updateSystemOption(request),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

/** A model served by two channels, the cheaper one already priced. */
const TWO_CHANNELS = {
  success: true,
  data: {
    model_channels: {
      'deepseek-v4.1-flash': [
        { channel_id: 2, channel_name: 'Cheap', groups: ['default'] },
        { channel_id: 7, channel_name: 'Pricey', groups: ['vip', 'default'] },
      ],
    },
    channel_prices: {
      'deepseek-v4.1-flash': { '2': 1.5 },
      'other-model': { '9': 4 },
    },
  },
}

function renderEditor(modelName: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ModelChannelPrices modelName={modelName} />
    </QueryClientProvider>
  )

  return queryClient
}

describe('per-channel price editor', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Channel prices saved': 'Channel prices saved',
      'Failed to load the channels serving this model.':
        'Failed to load the channels serving this model.',
      'Failed to save': 'Failed to save',
      Inherit: 'Inherit',
      'Only one channel serves this model, so there is no per-channel price to set.':
        'Only one channel serves this model, so there is no per-channel price to set.',
      'Save channel prices': 'Save channel prices',
    })
  })

  test('offers one price input per channel and seeds the saved value', async () => {
    getModelChannels.mockResolvedValue(TWO_CHANNELS)
    const queryClient = renderEditor('deepseek-v4.1-flash')

    const priced = await screen.findByRole('textbox', { name: 'Cheap' })
    const unpriced = screen.getByRole('textbox', { name: 'Pricey' })

    expect(priced).toHaveValue('1.5')
    expect(unpriced).toHaveValue('')
    expect(unpriced).toHaveAttribute('placeholder', 'Inherit')

    queryClient.clear()
  })

  test('tells the admin there is nothing to price when one channel serves the model', async () => {
    getModelChannels.mockResolvedValue({
      success: true,
      data: {
        model_channels: {
          solo: [{ channel_id: 1, channel_name: 'Only', groups: [] }],
        },
        channel_prices: {},
      },
    })
    const queryClient = renderEditor('solo')

    expect(
      await screen.findByText(
        'Only one channel serves this model, so there is no per-channel price to set.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save channel prices' })
    ).not.toBeInTheDocument()

    queryClient.clear()
  })

  test('saves the whole price map so other models keep their own prices', async () => {
    getModelChannels.mockResolvedValue(TWO_CHANNELS)
    updateSystemOption.mockResolvedValue({ success: true })
    const queryClient = renderEditor('deepseek-v4.1-flash')

    // Make channel 7 cheaper than channel 2's saved 1.5.
    fireEvent.change(await screen.findByRole('textbox', { name: 'Pricey' }), {
      target: { value: '0.8' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save channel prices' })
    )

    await waitFor(() => {
      expect(updateSystemOption).toHaveBeenCalledTimes(1)
    })

    const request = updateSystemOption.mock.calls[0][0] as {
      key: string
      value: string
    }
    expect(request.key).toBe('channel_pricing_setting.channel_model_price')
    expect(JSON.parse(request.value)).toEqual({
      'deepseek-v4.1-flash': { '2': 1.5, '7': 0.8 },
      'other-model': { '9': 4 },
    })

    queryClient.clear()
  })

  test('drops a model from the map once every channel price is cleared', async () => {
    getModelChannels.mockResolvedValue(TWO_CHANNELS)
    updateSystemOption.mockResolvedValue({ success: true })
    const queryClient = renderEditor('deepseek-v4.1-flash')

    fireEvent.change(await screen.findByRole('textbox', { name: 'Cheap' }), {
      target: { value: '' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save channel prices' })
    )

    await waitFor(() => {
      expect(updateSystemOption).toHaveBeenCalledTimes(1)
    })

    const request = updateSystemOption.mock.calls[0][0] as { value: string }
    expect(JSON.parse(request.value)).toEqual({ 'other-model': { '9': 4 } })

    queryClient.clear()
  })

  test('refuses to save a negative price', async () => {
    getModelChannels.mockResolvedValue(TWO_CHANNELS)
    const queryClient = renderEditor('deepseek-v4.1-flash')

    fireEvent.change(await screen.findByRole('textbox', { name: 'Cheap' }), {
      target: { value: '-1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save channel prices' })
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(updateSystemOption).not.toHaveBeenCalled()

    queryClient.clear()
  })
})
