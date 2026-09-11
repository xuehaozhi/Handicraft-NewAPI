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

New file added by Handicraft (not present upstream): the status monitor
endpoint backing the /status-monitor page.

Access control: this route is registered behind middleware.UserAuth(), so
the payload is only served to authenticated users. The aggregate usage
figures it exposes are business-sensitive, so do not move it to the
anonymous route group in router/api-router.go.
--------------------------------------------------------------------------
*/
package controller

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// globalUsageTTL bounds how often the aggregate is recomputed.
// model.GetGlobalUsageTotals performs a full aggregation over the logs table,
// which grows without bound on a busy instance.
const globalUsageTTL = 60 * time.Second

var (
	globalUsageMu    sync.Mutex
	globalUsageCache model.GlobalUsageTotals
	globalUsageErr   error
	globalUsageAt    time.Time
)

// getGlobalUsageTotals returns the cached all-time usage aggregate.
//
// The timestamp is stamped even on failure so that a broken query cannot be
// retried once per page load for every visitor.
func getGlobalUsageTotals() (model.GlobalUsageTotals, error) {
	globalUsageMu.Lock()
	defer globalUsageMu.Unlock()

	now := time.Now()
	if !globalUsageAt.IsZero() && now.Sub(globalUsageAt) < globalUsageTTL {
		return globalUsageCache, globalUsageErr
	}

	totals, err := model.GetGlobalUsageTotals()
	globalUsageCache = totals
	globalUsageErr = err
	globalUsageAt = now
	return totals, err
}

// GetStatusMonitor returns host resource metrics plus all-time usage totals.
//
// The two halves are independent: if the usage aggregate fails, the server
// metrics are still returned so the page can render partially instead of
// failing outright. `usage` is null in that case.
func GetStatusMonitor(c *gin.Context) {
	metrics := common.CollectSystemMetrics()

	usage, err := getGlobalUsageTotals()
	if err != nil {
		common.ApiSuccess(c, gin.H{
			"server": metrics,
			"usage":  nil,
		})
		return
	}

	common.ApiSuccess(c, gin.H{
		"server": metrics,
		"usage":  usage,
	})
}
