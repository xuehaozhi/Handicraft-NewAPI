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

New file added by Handicraft: characterises the existing, configuration-only
mechanism for per-channel model pricing.

Two channels may both serve "deepseek-v4.1-flash" while costing the operator
different amounts. Upstream prices models globally by name, so the operator can
instead publish per-channel aliases — "deepseek-v4.1-flash@channel-a" on one
channel and "@channel-b" on another — each with its own ratio, while each
channel's model_mapping rewrites the alias back to the real upstream name.

These tests pin the parts of that chain that live in this package, so a future
change to modifier parsing or billing-name resolution cannot silently break it.

They also pin the constraint that makes it work: the suffix must NOT contain a
colon, because "@key:value" is a reasoning modifier that gets stripped.
--------------------------------------------------------------------------
*/
package helper

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	kitreasoning "github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	hostreasoning "github.com/QuantumNous/new-api/setting/reasoning"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	perChannelBase   = "ds-v4.1-flash"
	perChannelAliasA = "ds-v4.1-flash@channel-a"
	perChannelAliasB = "ds-v4.1-flash@channel-b"
)

func withModelRatios(t *testing.T, ratiosJSON string) {
	t.Helper()

	savedRatio := ratio_setting.GetModelRatioCopy()
	savedPrice := ratio_setting.GetModelPriceCopy()
	t.Cleanup(func() {
		if payload, err := common.Marshal(savedRatio); err == nil {
			_ = ratio_setting.UpdateModelRatioByJSONString(string(payload))
		}
		if payload, err := common.Marshal(savedPrice); err == nil {
			_ = ratio_setting.UpdateModelPriceByJSONString(string(payload))
		}
	})

	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(ratiosJSON))
}

func TestPerChannelModelSuffixIsPricedIndependently(t *testing.T) {
	withModelRatios(t, `{"`+perChannelBase+`":1,"`+perChannelAliasA+`":2,"`+perChannelAliasB+`":4}`)

	baseRatio, ok, _ := ratio_setting.GetModelRatio(perChannelBase)
	require.True(t, ok, "the bare model must resolve from configuration")
	assert.Equal(t, 1.0, baseRatio)

	ratioA, okA, _ := ratio_setting.GetModelRatio(perChannelAliasA)
	require.True(t, okA, "the channel-alias must resolve from configuration")
	assert.Equal(t, 2.0, ratioA, "each alias carries its own ratio")

	ratioB, okB, _ := ratio_setting.GetModelRatio(perChannelAliasB)
	require.True(t, okB)
	assert.Equal(t, 4.0, ratioB)

	// Billing resolves the requested name through resolveBillingModelName and
	// then looks the ratio up under the name it returns. For the alias to be
	// billed at its own rate, that function must hand back the alias verbatim.
	assert.Equal(t, perChannelAliasA, resolveBillingModelName(perChannelAliasA))
	assert.Equal(t, perChannelAliasB, resolveBillingModelName(perChannelAliasB))
	assert.Equal(t, perChannelBase, resolveBillingModelName(perChannelBase))
}

func TestPerChannelAliasIsTreatedAsConfigured(t *testing.T) {
	withModelRatios(t, `{"`+perChannelAliasA+`":2}`)

	// HasPriceOrRatioEntry drives candidate selection in resolveBillingModelName.
	assert.True(t, HasPriceOrRatioEntry(perChannelAliasA))
	assert.False(t, HasPriceOrRatioEntry(perChannelBase))
}

// The alias must not look like a reasoning modifier. "@key:value" segments are
// stripped from the billing name, which would silently bill the alias at the
// bare model's rate instead.
func TestPerChannelAliasMustNotLookLikeAReasoningModifier(t *testing.T) {
	plain := kitreasoning.ParseModelModifiers(perChannelAliasA)
	assert.False(t, plain.HasModifiers(), "a colon-free suffix is not a modifier")
	assert.Equal(t, perChannelAliasA, plain.Base)

	colon := kitreasoning.ParseModelModifiers("ds-v4.1-flash@ch:1")
	assert.True(t, colon.HasModifiers(), "a colon-bearing segment IS a modifier")
	assert.Equal(t, perChannelBase, colon.Base, "and would strip the channel suffix")

	// setting/reasoning agrees with both conclusions, and is what price.go calls.
	assert.Equal(t, perChannelAliasA, hostreasoning.BaseModelName(perChannelAliasA))
	assert.Equal(t, perChannelBase, hostreasoning.BaseModelName("ds-v4.1-flash@ch:1"))
}

// Guard against a silent fallback: an unpriced alias must not quietly inherit
// the bare model's ratio, because that would make a misconfiguration invisible
// in the billing logs.
func TestUnpricedPerChannelAliasDoesNotInheritTheBaseRatio(t *testing.T) {
	withModelRatios(t, `{"`+perChannelBase+`":1}`)

	_, configured, _ := ratio_setting.GetModelRatio(perChannelAliasA)
	assert.False(t, configured, "an alias with no entry of its own is not configured")

	// resolveBillingModelName still returns the alias, not the base name, so
	// billing looks it up here and misses rather than falling back.
	assert.Equal(t, perChannelAliasA, resolveBillingModelName(perChannelAliasA))
}

// withChannelPrices installs the per-channel price table for one test and
// restores the previous one afterwards.
func withChannelPrices(t *testing.T, tableJSON string) {
	t.Helper()

	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
	})

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"channel_pricing_setting.channel_model_price": tableJSON,
	}))
}

func pricedRelayInfo(model string, channelID int) *relaycommon.RelayInfo {
	info := &relaycommon.RelayInfo{
		OriginModelName: model,
		UserGroup:       "default",
		UsingGroup:      "default",
	}
	info.ChannelMeta = &relaycommon.ChannelMeta{ChannelId: channelID}
	return info
}

func priceDataFor(t *testing.T, info *relaycommon.RelayInfo) hosttypes.PriceData {
	t.Helper()

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("group", "default")
	priceData, err := ModelPriceHelper(ctx, info, 1000, &types.TokenCountMeta{})
	require.NoError(t, err)
	return priceData
}

// The request is priced before it is routed, so the estimate cannot know which
// channel will serve it. Per-channel prices must therefore leave the estimate
// alone; they are applied later, by ApplyChannelPrice.
func TestModelPriceHelperEstimateIgnoresChannelPrices(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	priceData := priceDataFor(t, pricedRelayInfo(perChannelBase, 7))

	assert.Equal(t, 1.0, priceData.ModelRatio, "the estimate stays channel-agnostic")
}

// The price the routed channel charges is what the user pays, even when the
// model also has a global ratio.
func TestChannelPriceOverridesTheModelRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	info := pricedRelayInfo(perChannelBase, 7)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 7)

	// Quoted per 1M tokens, and a ratio of R costs 2R USD per 1M tokens.
	assert.Equal(t, 2.5, info.PriceData.ModelRatio)
}

func TestChannelPriceDoesNotLeakToOtherChannels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	info := pricedRelayInfo(perChannelBase, 8)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 8)

	assert.Equal(t, 1.0, info.PriceData.ModelRatio, "an unpriced channel keeps the model ratio")
}

// Retries re-select a channel and re-apply its price, so the charge follows the
// channel that actually served the request rather than the first one tried.
func TestApplyChannelPriceFollowsTheRetriedChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5,"8":9}}`)

	info := pricedRelayInfo(perChannelBase, 7)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 7)
	require.Equal(t, 2.5, info.PriceData.ModelRatio)

	ApplyChannelPrice(info, 8)

	assert.Equal(t, 4.5, info.PriceData.ModelRatio, "the retried channel's price takes over")
}

// Per-channel prices are quoted per 1M tokens, so they say nothing about a model
// billed a fixed amount per request. Such a model must keep its fixed price.
func TestChannelPriceIsIgnoredForRequestPricedModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	savedPrice := ratio_setting.GetModelPriceCopy()
	t.Cleanup(func() {
		if payload, err := common.Marshal(savedPrice); err == nil {
			_ = ratio_setting.UpdateModelPriceByJSONString(string(payload))
		}
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+perChannelBase+`":0.02}`))

	info := pricedRelayInfo(perChannelBase, 7)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 7)

	assert.True(t, info.PriceData.UsePrice, "a fixed-price model stays on fixed pricing")
	assert.Equal(t, 0.02, info.PriceData.ModelPrice)
	assert.Zero(t, info.PriceData.ModelRatio, "the token price must not become a ratio")
}

// Without a configured price nothing changes, on either path.
func TestModelPriceHelperWithoutChannelPricesIsUnchanged(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1.25}`)
	withChannelPrices(t, `{}`)

	info := pricedRelayInfo(perChannelBase, 7)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 7)

	assert.Equal(t, 1.25, info.PriceData.ModelRatio)
}

// The lookup accepts the name the request used, because the administrator
// configures the price under the model name clients ask for.
func TestChannelPriceIsFoundUnderTheRequestedModelName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1,"`+perChannelAliasA+`":1}`)
	withChannelPrices(t, `{"`+perChannelAliasA+`":{"7":5}}`)

	info := pricedRelayInfo(perChannelAliasA, 7)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 7)

	assert.Equal(t, 2.5, info.PriceData.ModelRatio)
}

// Per-channel prices refine a charge; they do not stand in for a missing model
// price, which has to exist before routing can even happen.
func TestModelWithoutAnyPriceIsStillRejectedBeforeRouting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	oldSelfUse := operation_setting.SelfUseModeEnabled
	operation_setting.SelfUseModeEnabled = false
	t.Cleanup(func() { operation_setting.SelfUseModeEnabled = oldSelfUse })

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("group", "default")
	_, err := ModelPriceHelper(ctx, pricedRelayInfo(perChannelBase, 7), 1000, &types.TokenCountMeta{})
	require.Error(t, err)
}

func TestApplyChannelPriceWithoutAChannelDoesNothing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withModelRatios(t, `{"`+perChannelBase+`":1}`)
	withChannelPrices(t, `{"`+perChannelBase+`":{"7":5}}`)

	info := pricedRelayInfo(perChannelBase, 0)
	priceDataFor(t, info)
	ApplyChannelPrice(info, 0)

	assert.Equal(t, 1.0, info.PriceData.ModelRatio)
}
