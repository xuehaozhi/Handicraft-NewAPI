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

New file added by Handicraft (not present upstream): the read endpoint behind
the per-channel price editor in the admin model pricing page.

Returns the model -> channels index and the current per-channel prices in one
response, so the editor needs a single request instead of joining two.
Read-only and admin-scoped; the prices themselves are written through the
existing settings endpoint, which already persists registered config sections.
--------------------------------------------------------------------------
*/
package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/channel_pricing_setting"
	"github.com/gin-gonic/gin"
)

// GetModelChannelInfos returns every model that an enabled channel serves,
// mapped to those channels, together with the configured per-channel prices.
func GetModelChannelInfos(c *gin.Context) {
	infos, err := model.GetModelChannelInfos()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"model_channels": infos,
		"channel_prices": channel_pricing_setting.GetAllChannelModelPrices(),
	})
}
