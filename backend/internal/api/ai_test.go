package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestAIChatRunsADKToolCall(t *testing.T) {
	var calls int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req map[string]any
		_ = json.Unmarshal(body, &req)
		msgs, _ := req["messages"].([]any)
		hasTool := false
		for _, m := range msgs {
			mm, _ := m.(map[string]any)
			if mm["role"] == "tool" {
				hasTool = true
			}
		}
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		if !hasTool {
			_, _ = w.Write([]byte(`{
				"model":"deepseek-v4.1-flash",
				"choices":[{"message":{"content":null,"tool_calls":[{"id":"call_1","type":"function","function":{
					"name":"create_frame","arguments":"{\"name\":\"AI Screen\",\"x\":0,\"y\":0,\"width\":390,\"height\":844,\"fill\":\"#ffffff\"}"
				}}]},"finish_reason":"tool_calls"}],
				"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}
			}`))
			return
		}
		_, _ = w.Write([]byte(`{
			"model":"deepseek-v4.1-flash",
			"choices":[{"message":{"content":"Created the AI Screen frame."},"finish_reason":"stop"}],
			"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}
		}`))
	}))
	defer mock.Close()

	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, err := st.CreateUser("u_test", "Test User", "test@example.com", "hash", "#0ea5e9")
	if err != nil {
		t.Fatal(err)
	}
	f, err := st.CreateFile("f_test", "Test File", u.ID, `{"pages":[{"id":"p1","name":"Page 1","nodes":{},"rootIds":[],"ts":1}],"tombstones":{}}`, "blank")
	if err != nil {
		t.Fatal(err)
	}
	am := auth.New("test-secret")
	enc, _ := encryptForKey("test-secret", "sk-test")
	if err := st.SaveAISettings(store.AISettingsRecord{
		UserID: u.ID, Provider: "deepseek", BaseURL: mock.URL, Model: "deepseek-v4.1-flash", APIKeyEnc: enc,
	}); err != nil {
		t.Fatal(err)
	}
	a := New(st, am, "", t.TempDir(), "test-secret")
	payload, _ := json.Marshal(map[string]any{
		"fileId": f.ID, "pageId": "p1", "message": "Create a mobile screen called AI Screen",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/ai/chat", bytes.NewReader(payload))
	rec := httptest.NewRecorder()
	a.handleAIChat(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Reply   string          `json:"reply"`
		Actions []map[string]any `json:"actions"`
		Doc     json.RawMessage `json:"doc"`
		Version int             `json:"version"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(resp.Reply, "Created") {
		t.Fatalf("unexpected reply: %q", resp.Reply)
	}
	if len(resp.Actions) == 0 {
		t.Fatalf("expected tool actions")
	}
	var doc struct {
		Pages []struct {
			Nodes map[string]map[string]any `json:"nodes"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(resp.Doc, &doc); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, n := range doc.Pages[0].Nodes {
		if n["name"] == "AI Screen" && n["type"] == "frame" {
			found = true
		}
	}
	if !found {
		t.Fatalf("tool did not create frame: %s", string(resp.Doc))
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least two model calls, got %d", calls)
	}
}
