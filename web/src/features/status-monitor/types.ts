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
New file added by Handicraft: types for the /status-monitor page.
--------------------------------------------------------------------------
*/

/** Host resource usage, mirroring common.SystemMetrics on the backend. */
export type ServerMetrics = {
  cpu_percent: number
  cpu_count: number
  memory_used: number
  memory_total: number
  memory_percent: number
  disk_used: number
  disk_total: number
  disk_percent: number
  /** Cumulative bytes since boot. */
  network_sent: number
  network_recv: number
  /** Bytes per second; zero until a second sample exists. */
  network_out_rate: number
  network_in_rate: number
  uptime_seconds: number
  goroutines: number
  go_mem_alloc: number
  go_version: string
  collected_at: number
}

/** Platform-wide totals, mirroring model.GlobalUsageTotals on the backend. */
export type UsageTotals = {
  total_requests: number
  total_tokens: number
  total_quota: number
}

export type StatusMonitorPayload = {
  server: ServerMetrics
  /** Null when the aggregate query failed; server metrics still render. */
  usage: UsageTotals | null
}
