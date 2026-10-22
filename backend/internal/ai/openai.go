package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"net/http"
	"strings"
	"time"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

const (
	DefaultProvider = "deepseek"
	DefaultBaseURL  = "https://api.deepseek.com"
	DefaultModel    = "deepseek-v4.1-flash"
)

type Config struct {
	APIKey  string
	BaseURL string
	Model   string
}

type OpenAICompatibleModel struct {
	cfg    Config
	client *http.Client
}

func NewOpenAICompatibleModel(cfg Config) *OpenAICompatibleModel {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultBaseURL
	}
	if cfg.Model == "" {
		cfg.Model = DefaultModel
	}
	return &OpenAICompatibleModel{
		cfg: cfg,
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (m *OpenAICompatibleModel) Name() string { return m.cfg.Model }

type openAIMessage struct {
	Role       string           `json:"role"`
	Content    *string          `json:"content,omitempty"`
	ToolCalls  []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`
}

type openAIToolCall struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function openAIFunctionCall `json:"function"`
}

type openAIFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAITool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string         `json:"name"`
		Description string         `json:"description,omitempty"`
		Parameters  map[string]any `json:"parameters,omitempty"`
	} `json:"function"`
}

type chatCompletionRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Tools       []openAITool    `json:"tools,omitempty"`
	ToolChoice  string          `json:"tool_choice,omitempty"`
	Temperature *float64        `json:"temperature,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Stream      bool            `json:"stream"`
}

type chatCompletionResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content          *string          `json:"content"`
			ReasoningContent string           `json:"reasoning_content"`
			ToolCalls        []openAIToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int32 `json:"prompt_tokens"`
		CompletionTokens int32 `json:"completion_tokens"`
		TotalTokens      int32 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (m *OpenAICompatibleModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		resp, err := m.generate(ctx, req)
		if err != nil {
			yield(nil, err)
			return
		}
		yield(resp, nil)
	}
}

func (m *OpenAICompatibleModel) generate(ctx context.Context, req *model.LLMRequest) (*model.LLMResponse, error) {
	payload := chatCompletionRequest{
		Model:    m.cfg.Model,
		Messages: buildMessages(req),
		Stream:   false,
	}
	if strings.TrimSpace(payload.Model) == "" {
		payload.Model = DefaultModel
	}
	if req.Config != nil {
		payload.Tools = buildTools(req.Config)
		if req.Config.Temperature != nil {
			t := float64(*req.Config.Temperature)
			payload.Temperature = &t
		}
		if req.Config.MaxOutputTokens > 0 {
			payload.MaxTokens = int(req.Config.MaxOutputTokens)
		}
	}
	if len(payload.Tools) > 0 {
		payload.ToolChoice = "auto"
	}
	if payload.MaxTokens == 0 {
		payload.MaxTokens = 4096
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	url := strings.TrimRight(m.cfg.BaseURL, "/")
	if !strings.HasSuffix(url, "/chat/completions") {
		url += "/chat/completions"
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+m.cfg.APIKey)
	httpResp, err := m.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("model request failed: %w", err)
	}
	defer httpResp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(httpResp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		var apiErr chatCompletionResponse
		if json.Unmarshal(raw, &apiErr) == nil && apiErr.Error != nil && apiErr.Error.Message != "" {
			return nil, fmt.Errorf("model error (%d): %s", httpResp.StatusCode, apiErr.Error.Message)
		}
		return nil, fmt.Errorf("model error (%d): %s", httpResp.StatusCode, truncate(string(raw), 500))
	}
	var resp chatCompletionResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("invalid model response: %w", err)
	}
	if resp.Error != nil && resp.Error.Message != "" {
		return nil, fmt.Errorf("model error: %s", resp.Error.Message)
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("model returned no choices")
	}
	choice := resp.Choices[0]
	parts := []*genai.Part{}
	if choice.Message.Content != nil && *choice.Message.Content != "" {
		parts = append(parts, &genai.Part{Text: *choice.Message.Content})
	}
	for i, tc := range choice.Message.ToolCalls {
		id := tc.ID
		if id == "" {
			id = fmt.Sprintf("call_%d", i+1)
		}
		args := map[string]any{}
		if tc.Function.Arguments != "" {
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				args = map[string]any{"_raw": tc.Function.Arguments}
			}
		}
		parts = append(parts, &genai.Part{
			FunctionCall: &genai.FunctionCall{ID: id, Name: tc.Function.Name, Args: args},
		})
	}
	if len(parts) == 0 {
		parts = append(parts, &genai.Part{Text: ""})
	}
	finish := genai.FinishReasonStop
	if choice.FinishReason == "length" {
		finish = genai.FinishReasonMaxTokens
	}
	return &model.LLMResponse{
		Content:    &genai.Content{Role: genai.RoleModel, Parts: parts},
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount:     resp.Usage.PromptTokens,
			CandidatesTokenCount: resp.Usage.CompletionTokens,
			TotalTokenCount:      resp.Usage.TotalTokens,
		},
		FinishReason: finish,
		TurnComplete: true,
		ModelVersion: resp.Model,
	}, nil
}

func buildMessages(req *model.LLMRequest) []openAIMessage {
	messages := []openAIMessage{}
	if req.Config != nil && req.Config.SystemInstruction != nil {
		if text := contentText(req.Config.SystemInstruction); text != "" {
			messages = append(messages, openAIMessage{Role: "system", Content: &text})
		}
	}
	for _, content := range req.Contents {
		if content == nil {
			continue
		}
		texts := []string{}
		var calls []*genai.FunctionCall
		var responses []*genai.FunctionResponse
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if part.Text != "" {
				texts = append(texts, part.Text)
			}
			if part.FunctionCall != nil {
				calls = append(calls, part.FunctionCall)
			}
			if part.FunctionResponse != nil {
				responses = append(responses, part.FunctionResponse)
			}
			if part.InlineData != nil {
				texts = append(texts, "[image omitted]")
			}
		}
		if len(responses) > 0 {
			for _, fr := range responses {
				text := ""
				if fr.Response != nil {
					if b, err := json.Marshal(fr.Response); err == nil {
						text = string(b)
					}
				}
				id := fr.ID
				if id == "" {
					id = fr.Name
				}
				messages = append(messages, openAIMessage{Role: "tool", Content: &text, ToolCallID: id})
			}
			continue
		}
		if len(calls) > 0 {
			msg := openAIMessage{Role: "assistant"}
			if len(texts) > 0 {
				text := strings.Join(texts, "\n")
				msg.Content = &text
			}
			for i, call := range calls {
				argsBytes, _ := json.Marshal(call.Args)
				id := call.ID
				if id == "" {
					id = fmt.Sprintf("call_%d", i+1)
				}
				msg.ToolCalls = append(msg.ToolCalls, openAIToolCall{
					ID: id, Type: "function",
					Function: openAIFunctionCall{Name: call.Name, Arguments: string(argsBytes)},
				})
			}
			messages = append(messages, msg)
			continue
		}
		role := "user"
		if content.Role == genai.RoleModel {
			role = "assistant"
		}
		text := strings.Join(texts, "\n")
		if text != "" {
			messages = append(messages, openAIMessage{Role: role, Content: &text})
		}
	}
	return messages
}

func contentText(c *genai.Content) string {
	parts := []string{}
	for _, p := range c.Parts {
		if p != nil && p.Text != "" {
			parts = append(parts, p.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func buildTools(cfg *genai.GenerateContentConfig) []openAITool {
	out := []openAITool{}
	for _, t := range cfg.Tools {
		if t == nil {
			continue
		}
		for _, fd := range t.FunctionDeclarations {
			if fd == nil {
				continue
			}
			params := map[string]any{"type": "object", "properties": map[string]any{}}
			if fd.ParametersJsonSchema != nil {
				if b, err := json.Marshal(fd.ParametersJsonSchema); err == nil {
					_ = json.Unmarshal(b, &params)
				}
			} else if fd.Parameters != nil {
				params = schemaToMap(fd.Parameters)
			}
			if _, ok := params["type"]; !ok {
				params["type"] = "object"
			}
			var tool openAITool
			tool.Type = "function"
			tool.Function.Name = fd.Name
			tool.Function.Description = fd.Description
			tool.Function.Parameters = params
			out = append(out, tool)
		}
	}
	return out
}

func schemaToMap(s *genai.Schema) map[string]any {
	out := map[string]any{}
	if s.Description != "" {
		out["description"] = s.Description
	}
	if len(s.Enum) > 0 {
		out["enum"] = s.Enum
	}
	if s.Format != "" {
		out["format"] = s.Format
	}
	if s.Nullable != nil {
		out["nullable"] = *s.Nullable
	}
	if s.Type != "" {
		out["type"] = strings.ToLower(string(s.Type))
	}
	if len(s.Required) > 0 {
		out["required"] = s.Required
	}
	if len(s.Properties) > 0 {
		props := map[string]any{}
		for k, v := range s.Properties {
			props[k] = schemaToMap(v)
		}
		out["properties"] = props
		out["type"] = "object"
	}
	if s.Items != nil {
		out["items"] = schemaToMap(s.Items)
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
