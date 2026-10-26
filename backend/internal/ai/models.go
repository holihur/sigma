package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

type modelListResponse struct {
	Data []struct {
		ID      string `json:"id"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// ListModels asks an OpenAI-compatible provider for the models available to
// the current account. Providers change model IDs frequently, so the UI treats
// this as the source of truth and still allows arbitrary manual IDs.
func ListModels(ctx context.Context, baseURL, apiKey string) ([]string, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("add an API key first")
	}
	url := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	url = strings.TrimSuffix(url, "/chat/completions")
	if !strings.HasSuffix(url, "/models") {
		url += "/models"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("model list failed (%d): %s", resp.StatusCode, truncate(strings.TrimSpace(string(raw)), 300))
	}
	var payload modelListResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("invalid model list: %w", err)
	}
	if payload.Error != nil && payload.Error.Message != "" {
		return nil, fmt.Errorf("%s", payload.Error.Message)
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(payload.Data))
	for _, item := range payload.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	sort.Strings(out)
	if len(out) == 0 {
		return nil, fmt.Errorf("provider returned no models")
	}
	return out, nil
}
