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

New file added by Handicraft (not present upstream): per-channel model prices.

Why: two channels may serve the same model at different prices. Upstream
prices a model globally by name, so the operator has no way to say "route this
model to the cheaper upstream, and charge what that upstream costs".

Shape: model -> channel ID (as a string, JSON object keys are strings) -> price.
Keyed by model first because that is how the admin UI presents it ("under this
model, here are its channels") and how the routing hot path looks it up
(candidate channel IDs are already in hand for a known model).

Storage: a registered config section rather than a column on `channels`. The
config subsystem already serialises map fields to the options table, so this
avoids a schema migration entirely — and AGENTS.md requires any migration to be
verified against SQLite, MySQL and PostgreSQL on both fresh and upgraded
databases, which is a large amount of risk for a single map.

Unit: the same unit as the operator-facing model price, i.e. price per 1M
tokens in the site's base currency. It is deliberately NOT converted here; the
UI is responsible for presenting it in the display currency. A deployment whose
USD and CNY rates are 1:1 therefore stores exactly the number the operator
typed.

NOTE: the json tag must not carry options such as `,omitempty`. The config
subsystem uses the raw tag text as the database key (setting/config/config.go),
so an option suffix would end up embedded in the key.
--------------------------------------------------------------------------
*/
package channel_pricing_setting

import (
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

// ChannelPricingSetting is managed by config.GlobalConfig.Register.
// DB key: channel_pricing_setting.channel_model_price
type ChannelPricingSetting struct {
	// ChannelModelPrice maps a model name to that model's price per 1M tokens
	// on each channel, keyed by channel ID rendered as a decimal string.
	ChannelModelPrice map[string]map[string]float64 `json:"channel_model_price"`
}

var channelPricingSetting = ChannelPricingSetting{
	ChannelModelPrice: make(map[string]map[string]float64),
}

func init() {
	config.GlobalConfig.Register("channel_pricing_setting", &channelPricingSetting)
}

// GetChannelModelPrice returns the price configured for one model on one
// channel. The boolean is false when this channel has no price of its own for
// the model, in which case callers fall back to the global model price.
//
// Hot path: called while selecting a channel, so it stays a pair of map reads.
func GetChannelModelPrice(model string, channelID int) (float64, bool) {
	byChannel, ok := channelPricingSetting.ChannelModelPrice[model]
	if !ok {
		return 0, false
	}
	price, ok := byChannel[strconv.Itoa(channelID)]
	if !ok {
		return 0, false
	}
	return price, true
}

// GetModelChannelPrices returns every channel price configured for a model,
// keyed by the channel ID rendered as a decimal string. The returned map is the
// live one; callers must not mutate it.
func GetModelChannelPrices(model string) map[string]float64 {
	return channelPricingSetting.ChannelModelPrice[model]
}

// GetAllChannelModelPrices returns the whole model -> channel -> price table.
// The returned map is the live one; callers must not mutate it.
func GetAllChannelModelPrices() map[string]map[string]float64 {
	return channelPricingSetting.ChannelModelPrice
}

// HasAnyChannelPrice reports whether any per-channel price is configured. Lets
// the routing hot path skip the lookup entirely on deployments that do not use
// this feature, which is the common case.
func HasAnyChannelPrice() bool {
	return len(channelPricingSetting.ChannelModelPrice) > 0
}

// ModelRatioForPrice converts a stored per-channel price into the model ratio
// billing works in.
//
// A ratio of R charges R quota per token, and quota is common.QuotaPerUnit (500k)
// per USD, so 1M tokens cost 2R USD. Inverting that gives R = price / 2.
//
// It lives next to the stored price rather than at either call site so the two
// billing paths that need it — the normal relay and the realtime websocket
// pre-consume — cannot drift apart.
func ModelRatioForPrice(price float64) float64 {
	return price / 2
}
