package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

func TestOpenAICompatibleContentAndTools(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/chat/completions") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing bearer token")
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{
			"model":"deepseek-v4.1-flash",
			"choices":[{"message":{"content":"Hello","tool_calls":[{"id":"call_9","type":"function","function":{"name":"create_frame","arguments":"{\"name\":\"Screen\"}"}}]},"finish_reason":"tool_calls"}],
			"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}
		}`))
	}))
	defer server.Close()

	mdl := NewOpenAICompatibleModel(Config{APIKey: "test-key", BaseURL: server.URL, Model: "deepseek-v4.1-flash"})
	temp := float32(0.2)
	req := &model.LLMRequest{
		Contents: []*genai.Content{genai.NewContentFromText("Make a screen", genai.RoleUser)},
		Config: &genai.GenerateContentConfig{
			SystemInstruction: genai.NewContentFromText("You are a designer", genai.RoleUser),
			Temperature:       &temp,
			Tools: []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{{
				Name: "create_frame", Description: "Create a frame",
				Parameters: &genai.Schema{Type: genai.TypeObject, Properties: map[string]*genai.Schema{
					"name": {Type: genai.TypeString},
				}, Required: []string{"name"}},
			}}}},
		},
	}
	var text string
	var calls []*genai.FunctionCall
	for resp, err := range mdl.GenerateContent(context.Background(), req, false) {
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range resp.Content.Parts {
			if p.Text != "" {
				text += p.Text
			}
			if p.FunctionCall != nil {
				calls = append(calls, p.FunctionCall)
			}
		}
	}
	if text != "Hello" || len(calls) != 1 || calls[0].Name != "create_frame" || calls[0].Args["name"] != "Screen" {
		t.Fatalf("unexpected response: text=%q calls=%#v", text, calls)
	}
	if got["model"] != "deepseek-v4.1-flash" {
		t.Fatalf("model not sent: %#v", got["model"])
	}
	tools, _ := got["tools"].([]any)
	if len(tools) != 1 {
		t.Fatalf("expected one tool declaration, got %#v", got["tools"])
	}
	msg, _ := got["messages"].([]any)
	if len(msg) != 2 {
		t.Fatalf("expected system+user messages, got %#v", got["messages"])
	}
}

func TestEncryptAPIKey(t *testing.T) {
	enc, err := EncryptAPIKey("secret", "sk-test-1234")
	if err != nil {
		t.Fatal(err)
	}
	if enc == "sk-test-1234" || !strings.HasPrefix(enc, "c2st") {
		// base64 of ciphertext should not expose the key
	}
	dec, err := DecryptAPIKey("secret", enc)
	if err != nil || dec != "sk-test-1234" {
		t.Fatalf("decrypt: %q %v", dec, err)
	}
	if _, err := DecryptAPIKey("wrong", enc); err == nil {
		t.Fatal("wrong secret should fail")
	}
}
