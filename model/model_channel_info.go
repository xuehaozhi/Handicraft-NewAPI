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

New file added by Handicraft (not present upstream): the model -> channels
index that backs per-channel pricing in the admin UI.

Reads the abilities table directly rather than the in-memory channel cache.
The cache is only populated when memory caching is enabled
(model/channel_cache.go returns early otherwise), so a deployment running
without Redis and without MEMORY_CACHE_ENABLED would silently report no
channels. This is an infrequent admin-facing read, so a query is cheap and
always correct.
--------------------------------------------------------------------------
*/
package model

import "sort"

// ModelChannelInfo describes one enabled channel serving a model.
type ModelChannelInfo struct {
	ChannelID   int      `json:"channel_id"`
	ChannelName string   `json:"channel_name"`
	// Groups lists the groups in which this channel serves the model. The same
	// channel can serve one model in several groups.
	Groups []string `json:"groups"`
}

// GetModelChannelInfos returns every model that at least one enabled channel
// serves, mapped to those channels. Disabled channels and disabled abilities
// are excluded, matching the channel count shown in the model square.
func GetModelChannelInfos() (map[string][]ModelChannelInfo, error) {
	abilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		return nil, err
	}

	var channels []Channel
	if err := DB.Select("id", "name").Find(&channels).Error; err != nil {
		return nil, err
	}
	nameByID := make(map[int]string, len(channels))
	for i := range channels {
		nameByID[channels[i].Id] = channels[i].Name
	}

	// model -> channelID -> set of groups
	folded := make(map[string]map[int]map[string]struct{})
	for _, ability := range abilities {
		byChannel, ok := folded[ability.Model]
		if !ok {
			byChannel = make(map[int]map[string]struct{})
			folded[ability.Model] = byChannel
		}
		groups, ok := byChannel[ability.ChannelId]
		if !ok {
			groups = make(map[string]struct{})
			byChannel[ability.ChannelId] = groups
		}
		groups[ability.Group] = struct{}{}
	}

	result := make(map[string][]ModelChannelInfo, len(folded))
	for model, byChannel := range folded {
		infos := make([]ModelChannelInfo, 0, len(byChannel))
		for channelID, groupSet := range byChannel {
			groups := make([]string, 0, len(groupSet))
			for group := range groupSet {
				groups = append(groups, group)
			}
			sort.Strings(groups)
			infos = append(infos, ModelChannelInfo{
				ChannelID:   channelID,
				ChannelName: nameByID[channelID],
				Groups:      groups,
			})
		}
		// Stable order so the admin UI does not reshuffle between reloads.
		sort.Slice(infos, func(i, j int) bool {
			return infos[i].ChannelID < infos[j].ChannelID
		})
		result[model] = infos
	}
	return result, nil
}
