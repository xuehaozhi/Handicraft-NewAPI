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

New file added by Handicraft: regression tests for the global image-input
guard.

Requests are built by unmarshalling real JSON rather than by constructing
DTO literals, because the guard depends on how "any"-typed content fields
actually materialise after decoding ([]any of map[string]any versus typed
slices). Literal construction would test a shape clients never produce.
--------------------------------------------------------------------------
*/
package helper

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- OpenAI chat/completions ------------------------------------------------

func TestRejectImageInputForOpenAIChat(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name: "given plain string content, the request is accepted",
			body: `{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`,
		},
		{
			name: "given only text parts, the request is accepted",
			body: `{"model":"gpt-4o","messages":[{"role":"user","content":[{"type":"text","text":"hi"}]}]}`,
		},
		{
			name: "given prose that merely mentions image_url, the request is accepted",
			body: `{"model":"gpt-4o","messages":[{"role":"user","content":"explain the image_url field please"}]}`,
		},
		{
			name: "given an image_url part, the request is refused",
			body: `{"model":"gpt-4o","messages":[{"role":"user","content":[{"type":"text","text":"what is this"},{"type":"image_url","image_url":{"url":"https://example.com/a.png"}}]}]}`,
			wantErr: true,
		},
		{
			name: "given a base64 data URI image, the request is refused",
			body: `{"model":"gpt-4o","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgo="}}]}]}`,
			wantErr: true,
		},
		{
			name: "given an image_url part in an assistant turn, the request is refused",
			body: `{"model":"gpt-4o","messages":[{"role":"assistant","content":[{"type":"image_url","image_url":"https://example.com/a.png"}]}]}`,
			wantErr: true,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := &dto.GeneralOpenAIRequest{}
			require.NoError(t, common.Unmarshal([]byte(testCase.body), request))

			err := RejectImageInput(request)

			if testCase.wantErr {
				require.ErrorIs(t, err, ErrImageInputDisabled)
				return
			}
			require.NoError(t, err)
		})
	}
}

// --- Claude -----------------------------------------------------------------

func TestRejectImageInputForClaude(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name: "given string content, the request is accepted",
			body: `{"model":"claude-3-5-sonnet","messages":[{"role":"user","content":"hello"}]}`,
		},
		{
			name: "given text blocks plus a text system prompt, the request is accepted",
			body: `{"model":"claude-3-5-sonnet","system":"be nice","messages":[{"role":"user","content":[{"type":"text","text":"hi"}]}]}`,
		},
		{
			name: "given a base64 image block, the request is refused",
			body: `{"model":"claude-3-5-sonnet","messages":[{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgo="}}]}]}`,
			wantErr: true,
		},
		{
			name: "given an image block in the system prompt, the request is refused",
			body: `{"model":"claude-3-5-sonnet","system":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgo="}}],"messages":[{"role":"user","content":"hi"}]}`,
			wantErr: true,
		},
		{
			// The nested case: an image smuggled inside a tool_result rather
			// than at the top level of the message content.
			name: "given an image nested inside a tool_result, the request is refused",
			body: `{"model":"claude-3-5-sonnet","messages":[{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":[{"type":"text","text":"see attached"},{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"/9j/4AAQ"}}]}]}]}`,
			wantErr: true,
		},
		{
			name: "given a tool_result holding only text, the request is accepted",
			body: `{"model":"claude-3-5-sonnet","messages":[{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":[{"type":"text","text":"42"}]}]}]}`,
			wantErr: false,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := &dto.ClaudeRequest{}
			require.NoError(t, common.Unmarshal([]byte(testCase.body), request))

			err := RejectImageInput(request)

			if testCase.wantErr {
				require.ErrorIs(t, err, ErrImageInputDisabled)
				return
			}
			require.NoError(t, err)
		})
	}
}

// --- Gemini -----------------------------------------------------------------

func TestRejectImageInputForGemini(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name: "given text-only parts, the request is accepted",
			body: `{"contents":[{"role":"user","parts":[{"text":"hello"}]}]}`,
		},
		{
			name: "given a non-image inline payload, the request is accepted",
			body: `{"contents":[{"role":"user","parts":[{"inlineData":{"mimeType":"application/pdf","data":"JVBERi0="}}]}]}`,
			wantErr: false,
		},
		{
			name: "given an inline image, the request is refused",
			body: `{"contents":[{"role":"user","parts":[{"inlineData":{"mimeType":"image/png","data":"iVBORw0KGgo="}}]}]}`,
			wantErr: true,
		},
		{
			name: "given a snake_case inline image, the request is refused",
			body: `{"contents":[{"role":"user","parts":[{"inline_data":{"mimeType":"image/webp","data":"UklGRg=="}}]}]}`,
			wantErr: true,
		},
		{
			name: "given a referenced image file, the request is refused",
			body: `{"contents":[{"role":"user","parts":[{"fileData":{"mimeType":"image/jpeg","fileUri":"https://example.com/a.jpg"}}]}]}`,
			wantErr: true,
		},
		{
			// Fail closed: fileData may omit its type and let the provider
			// infer one, so an untyped reference cannot be proven non-image.
			name: "given a file reference with no mime type, the request is refused",
			body: `{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://example.com/mystery"}}]}]}`,
			wantErr: true,
		},
		{
			name: "given a referenced pdf, the request is accepted",
			body: `{"contents":[{"role":"user","parts":[{"fileData":{"mimeType":"application/pdf","fileUri":"https://example.com/a.pdf"}}]}]}`,
		},
		{
			name: "given an image inside a batch entry, the request is refused",
			body: `{"requests":[{"contents":[{"role":"user","parts":[{"inlineData":{"mimeType":"image/png","data":"iVBORw0KGgo="}}]}]}]}`,
			wantErr: true,
		},
		{
			name: "given an image in systemInstruction, the request is refused",
			body: `{"systemInstruction":{"parts":[{"inlineData":{"mimeType":"image/png","data":"iVBORw0KGgo="}}]},"contents":[{"role":"user","parts":[{"text":"hi"}]}]}`,
			wantErr: true,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := &dto.GeminiChatRequest{}
			require.NoError(t, common.Unmarshal([]byte(testCase.body), request))

			err := RejectImageInput(request)

			if testCase.wantErr {
				require.ErrorIs(t, err, ErrImageInputDisabled)
				return
			}
			require.NoError(t, err)
		})
	}
}

// --- OpenAI Responses -------------------------------------------------------

func TestRejectImageInputForResponses(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name: "given a plain string input, the request is accepted",
			body: `{"model":"gpt-4o","input":"hello"}`,
		},
		{
			name: "given nested text content, the request is accepted",
			body: `{"model":"gpt-4o","input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}`,
		},
		{
			name: "given a nested input_image with a string url, the request is refused",
			body: `{"model":"gpt-4o","input":[{"role":"user","content":[{"type":"input_text","text":"look"},{"type":"input_image","image_url":"https://example.com/a.png"}]}]}`,
			wantErr: true,
		},
		{
			name: "given a nested input_image with an object url, the request is refused",
			body: `{"model":"gpt-4o","input":[{"role":"user","content":[{"type":"input_image","image_url":{"url":"https://example.com/a.png"}}]}]}`,
			wantErr: true,
		},
		{
			// Shape ParseInput does not normalise; covered by the extra scan.
			name: "given a top-level input_image entry, the request is refused",
			body: `{"model":"gpt-4o","input":[{"type":"input_image","image_url":"https://example.com/a.png"}]}`,
			wantErr: true,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := &dto.OpenAIResponsesRequest{}
			require.NoError(t, common.Unmarshal([]byte(testCase.body), request))

			err := RejectImageInput(request)

			if testCase.wantErr {
				require.ErrorIs(t, err, ErrImageInputDisabled)
				return
			}
			require.NoError(t, err)
		})
	}
}

// --- guard behaviour --------------------------------------------------------

func TestRejectImageInputIgnoresUnrelatedFormats(t *testing.T) {
	// Formats with no image-bearing content (for example embeddings) must not
	// be rejected by a guard that does not understand them.
	err := RejectImageInput(&dto.BaseRequest{})
	assert.NoError(t, err)

	// A nil request must be tolerated rather than panic.
	assert.NoError(t, RejectImageInput(nil))
}
