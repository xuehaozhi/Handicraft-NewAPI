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
New file added by Handicraft: tests for the status monitor byte formatter.
--------------------------------------------------------------------------
*/
import { describe, expect, test } from 'vitest'

import { formatByteRate, formatBytes } from '../lib/format'

describe('formatBytes', () => {
  test('given a value below one kilobyte, it is shown in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  test('given zero or a non-positive value, it renders as zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
  })

  test('given a missing or non-finite value, it renders as zero bytes instead of NaN', () => {
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  test('given a binary-scale value, it uses 1024-based units', () => {
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1024 ** 2)).toBe('1.00 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB')
    expect(formatBytes(1024 ** 4)).toBe('1.00 TB')
  })

  test('given a larger value, precision drops so the string stays compact', () => {
    expect(formatBytes(15 * 1024 ** 3)).toBe('15.0 GB')
    expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB')
  })
})

describe('formatByteRate', () => {
  test('given a throughput value, it is suffixed per second', () => {
    expect(formatByteRate(2048)).toBe('2.00 KB/s')
  })

  test('given a zero-throughput sample, it still renders a unit', () => {
    expect(formatByteRate(0)).toBe('0 B/s')
  })
})
