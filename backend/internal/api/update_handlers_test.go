package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/model"
	"sigma/internal/store"
)

func TestSystemUpdateRequiresAdmin(t *testing.T) {
	t.Setenv("SIGMA_ADMIN_EMAILS", "admin@example.com, ops@example.com")
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	admin, _ := st.CreateUser("u_admin", "Admin", "admin@example.com", "hash", "#0ea5e9")
	member, _ := st.CreateUser("u_member", "Member", "member@example.com", "hash", "#0ea5e9")
	am := auth.New("secret")
	a := New(st, am, "", t.TempDir(), "secret")

	token := func(u model.User) string {
		t.Helper()
		tok, err := am.Token(u.ID)
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	cases := []struct {
		name string
		user model.User
		want int
	}{
		{"admin", admin, http.StatusOK},
		{"member", member, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/system/update", nil)
			req.Header.Set("Authorization", "Bearer "+token(tc.user))
			rec := httptest.NewRecorder()
			a.requireAdmin(a.handleUpdateStatus)(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}

	if !a.isAdmin(model.User{Email: "OPS@example.com"}) {
		t.Fatal("admin email comparison should be case insensitive")
	}
	if a.isAdmin(model.User{Email: "member@example.com"}) {
		t.Fatal("member should not be admin")
	}
}
