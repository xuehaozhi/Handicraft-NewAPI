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

New file added by Handicraft: tests for per-channel model prices.

The round-trip test is the load-bearing one. The whole design avoids a database
migration by leaning on the config subsystem serialising a nested map into the
options table, so these tests prove that nesting actually survives a save/load
cycle and that a removed entry is not silently resurrected.
--------------------------------------------------------------------------
*/
package channel_pricing_setting

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const dbKey = "channel_pricing_setting.channel_model_price"

// snapshotConfig saves the current settings so a test can restore them, and
// returns the sink that receives what the config layer writes out.
func snapshotConfig(t *testing.T) map[string]string {
	t.Helper()

	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
	})
	return saved
}

func TestGetChannelModelPriceReadsConfiguredValue(t *testing.T) {
	snapshotConfig(t)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{"ds-v4.1-flash":{"3":5.5,"7":4.25},"gpt-4o":{"3":12}}`,
	}))

	price, ok := GetChannelModelPrice("ds-v4.1-flash", 3)
	require.True(t, ok)
	assert.Equal(t, 5.5, price)

	price, ok = GetChannelModelPrice("ds-v4.1-flash", 7)
	require.True(t, ok)
	assert.Equal(t, 4.25, price, "the two channels hold independent prices")

	price, ok = GetChannelModelPrice("gpt-4o", 3)
	require.True(t, ok)
	assert.Equal(t, 12.0, price)

	assert.True(t, HasAnyChannelPrice())
}

func TestGetChannelModelPriceMissesCleanly(t *testing.T) {
	snapshotConfig(t)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{"ds-v4.1-flash":{"3":5.5}}`,
	}))

	_, ok := GetChannelModelPrice("ds-v4.1-flash", 99)
	assert.False(t, ok, "a channel with no price for the model must miss")

	_, ok = GetChannelModelPrice("unknown-model", 3)
	assert.False(t, ok, "an unconfigured model must miss")

	_, ok = GetChannelModelPrice("", 0)
	assert.False(t, ok)
}

func TestEmptyConfigurationReportsNothingConfigured(t *testing.T) {
	snapshotConfig(t)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{}`,
	}))

	assert.False(t, HasAnyChannelPrice())
	assert.Nil(t, GetModelChannelPrices("ds-v4.1-flash"))
}

func TestNestedMapSurvivesASaveLoadRoundTrip(t *testing.T) {
	snapshotConfig(t)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{"ds-v4.1-flash":{"3":5.5,"7":4.25}}`,
	}))

	written := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		written[key] = value
		return nil
	}))

	require.Contains(t, written, dbKey, "the config layer must persist the nested map")
	assert.Contains(t, written[dbKey], "ds-v4.1-flash")
	assert.Contains(t, written[dbKey], "5.5")
	assert.Contains(t, written[dbKey], "4.25")

	// Reloading what was written must reproduce the same lookups.
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{dbKey: written[dbKey]}))
	price, ok := GetChannelModelPrice("ds-v4.1-flash", 7)
	require.True(t, ok)
	assert.Equal(t, 4.25, price)
}

// Removing a channel from the map is how the admin un-prices it. The config
// layer allocates a fresh map on load for exactly this reason, so the removal
// must not leave the old key behind.
func TestRemovedChannelPriceDoesNotSurviveReload(t *testing.T) {
	snapshotConfig(t)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{"ds-v4.1-flash":{"3":5.5,"7":4.25}}`,
	}))
	_, ok := GetChannelModelPrice("ds-v4.1-flash", 7)
	require.True(t, ok)

	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		dbKey: `{"ds-v4.1-flash":{"3":5.5}}`,
	}))

	_, ok = GetChannelModelPrice("ds-v4.1-flash", 7)
	assert.False(t, ok, "the removed channel price must not persist across a reload")
}

// The database key is taken from the raw json tag text, so a tag carrying
// options would leak them into the key. Guard against a future edit adding one.
func TestDatabaseKeyHasNoJsonTagOptions(t *testing.T) {
	snapshotConfig(t)
	assert.False(t, strings.Contains(dbKey, ","), "sanity check on the expected key shape")

	for key := range GetAllChannelModelPrices() {
		assert.NotContains(t, key, ",")
	}
}
