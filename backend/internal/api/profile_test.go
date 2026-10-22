package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestUpdateProfile(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_profile", "Old Name", "profile@example.com", "hash", "#0ea5e9")
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	body := `{"name":"New Name","color":"#7c5cff","avatar":"/api/uploads/avatar.png"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader(body))
	rec := httptest.NewRecorder()
	a.handleUpdateMe(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var out struct {
		User struct {
			Name   string `json:"name"`
			Color  string `json:"color"`
			Avatar string `json:"avatar"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.User.Name != "New Name" || out.User.Color != "#7c5cff" || out.User.Avatar != "/api/uploads/avatar.png" {
		t.Fatalf("bad profile: %s", rec.Body.String())
	}
	loaded, _ := st.UserByID(u.ID)
	if loaded.Name != "New Name" || loaded.Avatar != "/api/uploads/avatar.png" {
		t.Fatalf("not persisted: %#v", loaded)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/users/me", strings.NewReader(`{"name":"New Name","avatar":"https://evil.example/x.png"}`))
	rec = httptest.NewRecorder()
	a.handleUpdateMe(rec, req, loaded)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("external avatar should be rejected, got %d", rec.Code)
	}
}
