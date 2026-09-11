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

New file added by Handicraft (not present upstream): a global guard that
refuses any relay request carrying image content, regardless of model.

Scope and rationale:
  - Handicraft is text-only. Every model, built-in or user-added, must
    reject image input, so the check lives at the single choke point that
    all formats share (GetAndValidateRequest in valid_request.go) rather
    than in per-channel configuration that new models would bypass.
  - The guard is fail-closed by design. Where a format cannot prove that
    attached media is not an image, the request is refused.

Known gaps, deliberate and documented rather than silently ignored:
  1. /v1/images/edits (RelayFormatOpenAIImage) still accepts an input image.
     That endpoint exists to edit an image; it is not a model conversation.
     Add it to requestHasImageInput if Handicraft must refuse it too.
  2. RelayFormatOpenAIRealtime relays over a WebSocket and never parses a
     request body into a DTO, so this guard does not see its payloads.
--------------------------------------------------------------------------
*/
package helper

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// allowImageInput is the single switch for image input across the whole
// deployment. Handicraft ships with it hard-disabled; flipping it to true
// re-enables image input for every model at once.
//
// It is intentionally a constant rather than a database option: the
// requirement is a permanent product decision, and a runtime toggle would be
// silently re-enabled by anyone with settings access.
const allowImageInput = false

// ErrImageInputDisabled is returned to clients that send image content.
var ErrImageInputDisabled = errors.New(
	"image input is not supported on this deployment: this service accepts text-only requests, please remove any image content",
)

// maxMediaNestingDepth bounds recursion into nested media containers (for
// example a Claude tool_result whose content holds further blocks). Real
// payloads nest a couple of levels at most; the cap keeps a hostile deeply
// nested body from turning validation into unbounded recursion.
const maxMediaNestingDepth = 8

// RejectImageInput returns ErrImageInputDisabled when the parsed request
// carries image content in any supported relay format.
//
// Callers pass the request returned by GetAndValidateRequest, so every format
// is covered by construction.
func RejectImageInput(request dto.Request) error {
	if allowImageInput || request == nil {
		return nil
	}
	if requestHasImageInput(request) {
		return ErrImageInputDisabled
	}
	return nil
}

func requestHasImageInput(request dto.Request) bool {
	switch req := request.(type) {
	case *dto.GeneralOpenAIRequest:
		return openAIMessagesHaveImage(req.Messages)
	case *dto.ClaudeRequest:
		return claudeRequestHasImage(req)
	case *dto.GeminiChatRequest:
		return geminiRequestHasImage(req)
	case *dto.OpenAIResponsesRequest:
		return responsesRequestHasImage(req)
	}
	return false
}

// --- OpenAI chat/completions ------------------------------------------------

func openAIMessagesHaveImage(messages []dto.Message) bool {
	for i := range messages {
		for _, part := range messages[i].ParseContent() {
			if mediaContentIsImage(part) {
				return true
			}
		}
	}
	return false
}

func mediaContentIsImage(part dto.MediaContent) bool {
	// A populated image_url is decisive regardless of how "type" was spelled.
	if part.ImageUrl != nil {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(part.Type)) {
	case dto.ContentTypeImageURL, "input_image", "image":
		return true
	}
	return false
}

// --- Claude messages --------------------------------------------------------

func claudeRequestHasImage(req *dto.ClaudeRequest) bool {
	for i := range req.Messages {
		parts, err := req.Messages[i].ParseContent()
		if err != nil {
			continue
		}
		if claudePartsHaveImage(parts, 0) {
			return true
		}
	}
	// The system prompt accepts content blocks too.
	return claudePartsHaveImage(req.ParseSystem(), 0)
}

func claudePartsHaveImage(parts []dto.ClaudeMediaMessage, depth int) bool {
	if depth > maxMediaNestingDepth {
		// Too deep to reason about: refuse rather than assume it is text.
		return true
	}
	for i := range parts {
		if claudePartIsImage(parts[i]) {
			return true
		}
		// tool_result blocks carry their own nested content, which may hold
		// images supplied by the client.
		if nested := parts[i].ParseMediaContent(); len(nested) > 0 {
			if claudePartsHaveImage(nested, depth+1) {
				return true
			}
		}
	}
	return false
}

func claudePartIsImage(part dto.ClaudeMediaMessage) bool {
	if strings.EqualFold(strings.TrimSpace(part.Type), "image") {
		return true
	}
	// An image block always carries a source; trust its media type when the
	// type field is missing or renamed.
	if part.Source != nil && isImageMimeType(part.Source.MediaType) {
		return true
	}
	return false
}

// --- Gemini -----------------------------------------------------------------

func geminiRequestHasImage(req *dto.GeminiChatRequest) bool {
	if geminiContentsHaveImage(req.Contents) {
		return true
	}
	if req.SystemInstructions != nil && geminiPartsHaveImage(req.SystemInstructions.Parts) {
		return true
	}
	// Batch requests wrap a whole request per entry.
	for i := range req.Requests {
		if geminiRequestHasImage(&req.Requests[i]) {
			return true
		}
	}
	return false
}

func geminiContentsHaveImage(contents []dto.GeminiChatContent) bool {
	for i := range contents {
		if geminiPartsHaveImage(contents[i].Parts) {
			return true
		}
	}
	return false
}

func geminiPartsHaveImage(parts []dto.GeminiPart) bool {
	for i := range parts {
		part := parts[i]
		if part.InlineData != nil && isImageMimeType(part.InlineData.MimeType) {
			return true
		}
		if part.FileData != nil {
			// inlineData always declares a mime type, but fileData may omit it
			// and let the provider infer one from the uploaded file. An absent
			// type cannot be proven non-image, so fail closed.
			if part.FileData.MimeType == "" || isImageMimeType(part.FileData.MimeType) {
				return true
			}
		}
	}
	return false
}

func isImageMimeType(mimeType string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/")
}

// --- OpenAI Responses -------------------------------------------------------

func responsesRequestHasImage(req *dto.OpenAIResponsesRequest) bool {
	for _, item := range req.ParseInput() {
		if responsesItemIsImage(item.Type, item.ImageUrl) {
			return true
		}
	}
	return responsesTopLevelInputHasImage(req.Input)
}

func responsesItemIsImage(itemType string, imageURL string) bool {
	if imageURL != "" {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(itemType)) {
	case "input_image", "image", "image_url":
		return true
	}
	return false
}

// responsesTopLevelInputHasImage covers a shape ParseInput does not normalise:
// an `input` array whose entries carry `type` directly instead of nesting it
// under `content`. Without this, such an entry would slip past the guard.
func responsesTopLevelInputHasImage(raw json.RawMessage) bool {
	if len(raw) == 0 || common.GetJsonType(raw) != "array" {
		return false
	}

	var entries []struct {
		Type     string          `json:"type"`
		ImageUrl json.RawMessage `json:"image_url"`
	}
	if err := common.Unmarshal(raw, &entries); err != nil {
		return false
	}

	for _, entry := range entries {
		if responsesItemIsImage(entry.Type, "") {
			return true
		}
		// image_url may be a string or an object; either way its presence on a
		// top-level entry means image content.
		if len(entry.ImageUrl) > 0 && string(entry.ImageUrl) != "null" {
			return true
		}
	}
	return false
}
