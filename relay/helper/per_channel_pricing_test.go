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
	"testing"

	"github.com/QuantumNous/new-api/common"
	kitreasoning "github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	hostreasoning "github.com/QuantumNous/new-api/setting/reasoning"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
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
