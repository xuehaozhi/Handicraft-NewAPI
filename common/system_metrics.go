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

New file added by Handicraft (not present upstream): an on-demand system
metrics collector backing the status monitor page.

Why this exists alongside common/system_monitor.go: the upstream monitor
only samples while the performance monitor option is enabled, so a status
page built on GetSystemStatus() would read all zeros on a default install.
This collector samples on demand instead, and adds network throughput,
which upstream does not track at all.

Sampling is cached for a few seconds so a busy status page cannot turn
into a CPU/gopsutil amplifier, and so the collectedAt/rate figures stay
meaningful.
--------------------------------------------------------------------------
*/
package common

import (
	"runtime"
	"sync"
	"time"

	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/mem"
	gopsutilnet "github.com/shirou/gopsutil/net"
)

// SystemMetrics is a point-in-time snapshot of host resource usage.
type SystemMetrics struct {
	CPUPercent float64 `json:"cpu_percent"`
	CPUCount   int     `json:"cpu_count"`

	MemoryUsed    uint64  `json:"memory_used"`
	MemoryTotal   uint64  `json:"memory_total"`
	MemoryPercent float64 `json:"memory_percent"`

	DiskUsed    uint64  `json:"disk_used"`
	DiskTotal   uint64  `json:"disk_total"`
	DiskPercent float64 `json:"disk_percent"`

	// Cumulative byte counters since boot.
	NetworkSent uint64 `json:"network_sent"`
	NetworkRecv uint64 `json:"network_recv"`

	// Bytes per second since the previous sample. Zero on the first sample,
	// because a rate needs two observations.
	NetworkOutRate float64 `json:"network_out_rate"`
	NetworkInRate  float64 `json:"network_in_rate"`

	UptimeSeconds int64  `json:"uptime_seconds"`
	Goroutines    int    `json:"goroutines"`
	GoMemAlloc    uint64 `json:"go_mem_alloc"`
	GoVersion     string `json:"go_version"`
	CollectedAt   int64  `json:"collected_at"`
}

// systemMetricsTTL bounds how often the host is actually sampled. gopsutil
// calls are comparatively expensive and the status page may be refreshed or
// polled by many users at once.
const systemMetricsTTL = 5 * time.Second

var (
	systemMetricsMu    sync.Mutex
	systemMetricsCache SystemMetrics
	systemMetricsAt    time.Time

	previousNetworkSample struct {
		sent  uint64
		recv  uint64
		at    time.Time
		valid bool
	}
)

// CollectSystemMetrics returns a cached snapshot of host resource usage,
// sampling the host only when the cached value is older than systemMetricsTTL.
//
// Safe for concurrent use, and never fails: any individual probe that errors
// simply leaves its field at zero rather than failing the whole snapshot.
func CollectSystemMetrics() SystemMetrics {
	systemMetricsMu.Lock()
	defer systemMetricsMu.Unlock()

	now := time.Now()
	if !systemMetricsAt.IsZero() && now.Sub(systemMetricsAt) < systemMetricsTTL {
		return systemMetricsCache
	}

	metrics := SystemMetrics{
		CPUCount:      runtime.NumCPU(),
		UptimeSeconds: now.Unix() - StartTime,
		Goroutines:    runtime.NumGoroutine(),
		GoVersion:     runtime.Version(),
		CollectedAt:   now.Unix(),
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	metrics.GoMemAlloc = memStats.Alloc

	// Non-blocking: returns the average since the previous call.
	if percents, err := cpu.Percent(0, false); err == nil && len(percents) > 0 {
		metrics.CPUPercent = percents[0]
	}

	if memInfo, err := mem.VirtualMemory(); err == nil {
		metrics.MemoryUsed = memInfo.Used
		metrics.MemoryTotal = memInfo.Total
		metrics.MemoryPercent = memInfo.UsedPercent
	}

	if diskInfo := GetDiskSpaceInfo(); diskInfo.Total > 0 {
		metrics.DiskUsed = diskInfo.Used
		metrics.DiskTotal = diskInfo.Total
		metrics.DiskPercent = diskInfo.UsedPercent
	}

	if counters, err := gopsutilnet.IOCounters(false); err == nil && len(counters) > 0 {
		sent := counters[0].BytesSent
		recv := counters[0].BytesRecv
		metrics.NetworkSent = sent
		metrics.NetworkRecv = recv

		// Counters are monotonic since boot, but guard against a reset or a
		// wrap so the subtraction can never produce an absurd rate.
		if previousNetworkSample.valid {
			elapsed := now.Sub(previousNetworkSample.at).Seconds()
			if elapsed > 0 &&
				sent >= previousNetworkSample.sent &&
				recv >= previousNetworkSample.recv {
				metrics.NetworkOutRate = float64(sent-previousNetworkSample.sent) / elapsed
				metrics.NetworkInRate = float64(recv-previousNetworkSample.recv) / elapsed
			}
		}

		previousNetworkSample.sent = sent
		previousNetworkSample.recv = recv
		previousNetworkSample.at = now
		previousNetworkSample.valid = true
	}

	systemMetricsCache = metrics
	systemMetricsAt = now
	return metrics
}
