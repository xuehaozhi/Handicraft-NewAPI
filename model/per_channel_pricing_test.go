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

New file added by Handicraft (not present upstream): per-channel price
preference during channel selection.

The contract these tests protect is narrow and load-bearing:

  - priority still decides WHICH tier is used; price only breaks the tie
    inside one tier, so an administrator can always pin a channel;
  - inside a tier, only the cheapest candidates remain, and weight still
    spreads load across them when several share that price;
  - a deployment with no per-channel prices behaves exactly as before.

They drive the real GetRandomSatisfiedChannel against a hand-built cache
rather than a helper, because the ordering being tested is an emergent
property of the priority tier selection and the weight draw together.
--------------------------------------------------------------------------
*/
package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const priceTestModel = "price-test-model"

func pricedChannel(id int, priority int64, weight uint) *Channel {
	return &Channel{Id: id, Name: fmt.Sprintf("channel-%d", id), Priority: &priority, Weight: &weight}
}

// withSelectionCache installs a hand-built channel cache for one test. Tests in
// this package run without a database, and selection reads the cache directly.
func withSelectionCache(t *testing.T, channels []*Channel) {
	t.Helper()

	oldMemoryCache := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = oldMemoryCache })

	byID := make(map[int]*Channel, len(channels))
	ids := make([]int, 0, len(channels))
	for _, channel := range channels {
		byID[channel.Id] = channel
		ids = append(ids, channel.Id)
	}

	channelSyncLock.Lock()
	oldChannels, oldIndex := channelsIDM, group2model2channels
	channelsIDM = byID
	group2model2channels = map[string]map[string][]int{
		"default": {priceTestModel: ids},
	}
	channelSyncLock.Unlock()

	t.Cleanup(func() {
		channelSyncLock.Lock()
		channelsIDM, group2model2channels = oldChannels, oldIndex
		channelSyncLock.Unlock()
	})
}

// withPriceConfig sets the model's global ratio and the per-channel price table,
// restoring both afterwards.
func withPriceConfig(t *testing.T, ratioJSON, channelPricesJSON string) {
	t.Helper()

	savedRatios := ratio_setting.ModelRatio2JSONString()
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(savedRatios))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(ratioJSON))

	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
	})
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"channel_pricing_setting.channel_model_price": channelPricesJSON,
	}))
}

// picks returns the set of channels selected by count independent draws.
func picks(t *testing.T, count int) map[int]int {
	t.Helper()

	seen := make(map[int]int)
	for range count {
		channel, err := GetRandomSatisfiedChannel("default", priceTestModel, 0, nil)
		require.NoError(t, err)
		require.NotNil(t, channel)
		seen[channel.Id]++
	}
	return seen
}

func TestCheapestChannelWinsInsideAPriorityTier(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"2":0.5}}`)
	// Same priority, equal weights: only the price separates them.
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 0, 1),
		pricedChannel(2, 0, 1),
		pricedChannel(3, 0, 1),
	})

	seen := picks(t, 60)

	assert.Equal(t, map[int]int{2: 60}, seen, "only the cheapest channel may be selected")
}

// A channel with no price of its own is billed at the model price, so pricing one
// channel below the model price is enough to make it win.
func TestUnpricedChannelsCompeteOnTheModelPrice(t *testing.T) {
	// Ratio 1 is 2 USD per 1M tokens; channel 4 undercuts it at 1.5.
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"4":1.5}}`)
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 0, 1),
		pricedChannel(2, 0, 1),
		pricedChannel(4, 0, 1),
	})

	seen := picks(t, 60)

	assert.Equal(t, map[int]int{4: 60}, seen)
}

// Load still spreads across every channel that shares the cheapest price.
func TestCheapestTieIsStillWeightedRandom(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"1":0.5,"3":0.5}}`)
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 0, 1),
		pricedChannel(2, 0, 1),
		pricedChannel(3, 0, 1),
	})

	seen := picks(t, 200)

	assert.Zero(t, seen[2], "the expensive channel must not be selected")
	assert.Positive(t, seen[1], "a tie is still spread by weight")
	assert.Positive(t, seen[3], "a tie is still spread by weight")
}

// The administrator's pin must survive a cheaper channel existing.
func TestPriorityOverridesPrice(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"1":99}}`)
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 10, 1),
		pricedChannel(2, 5, 1),
	})

	seen := picks(t, 60)

	assert.Equal(t, map[int]int{1: 60}, seen, "the high-priority channel is used however it is priced")
}

// A lower priority tier is reached by retrying, which is how an operator asks for
// "cheap first, expensive on retry".
func TestRetryReachesTheCheaperLowerPriorityTier(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"2":0.1}}`)
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 10, 1),
		pricedChannel(2, 5, 1),
	})

	first, err := GetRandomSatisfiedChannel("default", priceTestModel, 0, nil)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, 1, first.Id)

	second, err := GetRandomSatisfiedChannel("default", priceTestModel, 1, nil)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, 2, second.Id, "retrying moves down a priority tier, price notwithstanding")
}

// The whole feature must be invisible until an operator configures a price. With
// none, selection is the upstream weighted draw across all candidates.
func TestSelectionIsUnchangedWithoutChannelPrices(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{}`)
	withSelectionCache(t, []*Channel{
		pricedChannel(1, 0, 1),
		pricedChannel(2, 0, 1),
		pricedChannel(3, 0, 1),
	})

	seen := picks(t, 200)

	assert.Len(t, seen, 3, "every channel stays reachable")
}

// Per-channel prices are quoted per 1M tokens, so they say nothing about a model
// billed a fixed amount per request.
func TestRequestPricedModelIgnoresChannelPrices(t *testing.T) {
	withPriceConfig(t, `{}`, `{"`+priceTestModel+`":{"2":0.0001}}`)

	savedPrices := ratio_setting.GetModelPriceCopy()
	t.Cleanup(func() {
		if payload, err := common.Marshal(savedPrices); err == nil {
			_ = ratio_setting.UpdateModelPriceByJSONString(string(payload))
		}
	})
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"`+priceTestModel+`":0.02}`))

	withSelectionCache(t, []*Channel{
		pricedChannel(1, 0, 1),
		pricedChannel(2, 0, 1),
	})

	seen := picks(t, 200)

	assert.Len(t, seen, 2, "a request-priced model keeps the weighted draw")
}

func TestSingleCandidateIsReturnedAsIs(t *testing.T) {
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"1":99}}`)
	withSelectionCache(t, []*Channel{pricedChannel(1, 0, 1)})

	channel, err := GetRandomSatisfiedChannel("default", priceTestModel, 0, nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 1, channel.Id)
}

// The default deployment leaves MEMORY_CACHE_ENABLED off, so this database path
// is the one that actually routes requests. It must apply the same price rule.
func TestDatabaseSelectionPathPrefersTheCheapestChannel(t *testing.T) {
	truncateTables(t)
	withPriceConfig(t, `{"`+priceTestModel+`":1}`, `{"`+priceTestModel+`":{"2":0.5}}`)

	insert := func(id int) {
		priority := int64(0)
		weight := uint(1)
		channel := &Channel{
			Id:       id,
			Type:     constant.ChannelTypeOpenAI,
			Status:   common.ChannelStatusEnabled,
			Name:     fmt.Sprintf("channel-%d", id),
			Models:   priceTestModel,
			Group:    "default",
			Priority: &priority,
			Weight:   &weight,
		}
		require.NoError(t, channel.Insert())
	}
	insert(1)
	insert(2)
	insert(3)

	for range 40 {
		selected, err := GetChannel("default", priceTestModel, 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		require.Equal(t, 2, selected.Id, "only the cheapest channel may be selected")
	}
}
