package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/model"
	"sigma/internal/store"
)

func TestMCPInitializeListAndToolCall(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_mcp", "MCP User", "mcp@example.com", "hash", "#0ea5e9")
	f, _ := st.CreateFile("f_mcp", "MCP File", u.ID, `{"pages":[{"id":"p1","name":"Page 1","nodes":{},"rootIds":[],"ts":1}],"tombstones":{}}`, "blank")
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")

	callPAT := func(id string, method string, params any, scopes []string, viaPAT bool) map[string]any {
		payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
		req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(payload))
		rec := httptest.NewRecorder()
		a.handleMCP(rec, req, u, scopes, viaPAT)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status %d: %s", method, rec.Code, rec.Body.String())
		}
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	call := func(id string, method string, params any) map[string]any {
		return callPAT(id, method, params, nil, false)
	}

	init := call("1", "initialize", map[string]any{})
	result := init["result"].(map[string]any)
	if result["protocolVersion"] == "" || result["serverInfo"] == nil {
		t.Fatalf("bad initialize result: %#v", result)
	}
	list := call("2", "tools/list", map[string]any{})
	tools := list["result"].(map[string]any)["tools"].([]any)
	if len(tools) < 10 {
		t.Fatalf("expected tools, got %d", len(tools))
	}
	created := call("3", "tools/call", map[string]any{
		"name": "create_frame",
		"arguments": map[string]any{
			"fileId": f.ID, "pageId": "p1", "name": "MCP Screen", "x": 0, "y": 0, "width": 390, "height": 844,
		},
	})
	res := created["result"].(map[string]any)
	if res["isError"] == true {
		t.Fatalf("tool error: %#v", res)
	}
	summary := call("4", "tools/call", map[string]any{
		"name": "get_page", "arguments": map[string]any{"fileId": f.ID, "pageId": "p1"},
	})
	structured := summary["result"].(map[string]any)["structuredContent"].(map[string]any)
	if structured["count"].(float64) != 1 {
		t.Fatalf("expected one node, got %#v", structured)
	}

	// A read-only PAT can inspect but not mutate.
	denied := callPAT("5", "tools/call", map[string]any{
		"name": "create_frame", "arguments": map[string]any{"fileId": f.ID, "name": "Nope", "width": 100, "height": 100},
	}, []string{auth.ScopeMCPRead}, true)
	if denied["result"].(map[string]any)["isError"] != true {
		t.Fatalf("read-only PAT should not write: %#v", denied)
	}
	allowed := callPAT("6", "tools/call", map[string]any{
		"name": "create_frame", "arguments": map[string]any{"fileId": f.ID, "name": "PAT Screen", "width": 100, "height": 100},
	}, []string{auth.ScopeMCPRead, auth.ScopeMCPWrite}, true)
	if allowed["result"].(map[string]any)["isError"] == true {
		t.Fatalf("write PAT failed: %#v", allowed)
	}
}

func TestMCPPersonalAccessTokenAuth(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_pat", "PAT User", "pat@example.com", "hash", "#0ea5e9")
	raw, hash, prefix, err := auth.NewPAT()
	if err != nil {
		t.Fatal(err)
	}
	if err := st.CreatePAT(store.PATRecord{
		ID: "pat_1", UserID: u.ID, Name: "Agent", Prefix: prefix, TokenHash: hash,
		Scopes: "mcp:read mcp:write", CreatedAt: model.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	called := false
	h := a.requireMCPAuth(func(w http.ResponseWriter, r *http.Request, got model.User, scopes []string, viaPAT bool) {
		called = true
		if !viaPAT || got.ID != u.ID || !auth.HasScope(scopes, auth.ScopeMCPWrite) {
			t.Fatalf("bad principal: %#v %#v %v", got, scopes, viaPAT)
		}
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	rec := httptest.NewRecorder()
	h(rec, req)
	if !called || rec.Code != http.StatusOK {
		t.Fatalf("PAT auth failed: %d %s", rec.Code, rec.Body.String())
	}
	recs, _ := st.ListPATs(u.ID)
	if len(recs) != 1 || recs[0].LastUsedAt == "" {
		t.Fatalf("last used not touched: %#v", recs)
	}
}
