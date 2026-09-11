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
New file added by Handicraft: byte formatting for the status monitor.
--------------------------------------------------------------------------
*/
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * Format a byte count with a binary (1024-based) unit.
 *
 * The backend reports raw byte counts, which are unreadable at GB/TB scale,
 * so every byte figure on the status monitor goes through here.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (
    bytes === null ||
    bytes === undefined ||
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return '0 B'
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  )
  const value = bytes / 1024 ** exponent

  // Keep roughly three significant figures without trailing noise.
  let digits = 2
  if (value >= 100) {
    digits = 0
  } else if (value >= 10) {
    digits = 1
  }
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

/** Format a throughput figure in bytes per second. */
export function formatByteRate(bytesPerSecond: number | null | undefined): string {
  return `${formatBytes(bytesPerSecond)}/s`
}
