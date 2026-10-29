package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sigma/internal/doc"
)

func TestValidateDocRejectsOutOfRangeVectorPoints(t *testing.T) {
	bad := doc.Doc{Pages: []doc.Page{{
		ID: "p1",
		Nodes: map[string]json.RawMessage{
			"v1": json.RawMessage(`{"id":"v1","type":"vector","x":0,"y":0,"width":10,"height":10,"points":[{"x":2,"y":0.5}],"ts":1}`),
		},
	}}}
	if err := validateDocLimits(&bad); err == nil || !strings.Contains(err.Error(), "vector point") {
		t.Fatalf("expected out-of-range point error, got %v", err)
	}

	good := doc.Doc{Pages: []doc.Page{{
		ID: "p1",
		Nodes: map[string]json.RawMessage{
			"v1": json.RawMessage(`{"id":"v1","type":"vector","x":0,"y":0,"width":10,"height":10,"points":[{"x":1,"y":0.5,"in":{"x":0.5,"y":0},"out":{"x":0.5,"y":1}}],"ts":1}`),
		},
	}}}
	if err := validateDocLimits(&good); err != nil {
		t.Fatalf("valid vector rejected: %v", err)
	}
}

func TestCreateCommentRejectsNonFiniteOrDistantCoordinates(t *testing.T) {
	a, fileID := newPageTestAPI(t)
	u, _ := a.st.UserByID("u_pages")

	req := httptest.NewRequest(http.MethodPost, "/api/files/"+fileID+"/comments", strings.NewReader(
		`{"pageId":"p1","x":1e9,"y":0,"text":"hello"}`,
	))
	req.SetPathValue("id", fileID)
	rec := httptest.NewRecorder()
	a.handleCreateComment(rec, req, u)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for distant comment, got %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/files/"+fileID+"/comments", strings.NewReader(
		`{"pageId":"p1","x":120,"y":80,"text":"hello"}`,
	))
	req.SetPathValue("id", fileID)
	rec = httptest.NewRecorder()
	a.handleCreateComment(rec, req, u)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid comment, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginSetsHttpOnlySessionCookie(t *testing.T) {
	a, _ := newPageTestAPI(t)
	hash, err := a.auth.HashPassword("correct-horse-battery")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.st.CreateUser("u_cookie", "Cookie", "cookie@example.com", hash, "#0ea5e9"); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(
		`{"email":"cookie@example.com","password":"correct-horse-battery"}`,
	))
	rec := httptest.NewRecorder()
	a.handleLogin(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login status %d: %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 || cookies[0].Name != authCookieName || !cookies[0].HttpOnly {
		t.Fatalf("expected HttpOnly %s cookie, got %#v", authCookieName, cookies)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(cookies[0])
	rec = httptest.NewRecorder()
	a.requireAuth(a.handleMe)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("cookie auth status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListFilesPagination(t *testing.T) {
	a, _ := newPageTestAPI(t)
	u, _ := a.st.UserByID("u_pages")
	for i := 0; i < 5; i++ {
		if _, err := a.st.CreateFile("f_page_"+string(rune('a'+i)), "Design "+string(rune('A'+i)), u.ID, twoPageDoc, "blank"); err != nil {
			t.Fatal(err)
		}
	}
	page, total, err := a.st.ListFilesPage(u.ID, 3, 1)
	if err != nil {
		t.Fatal(err)
	}
	if total != 6 || len(page) != 3 {
		t.Fatalf("pagination total=%d len=%d", total, len(page))
	}
}

func TestAllowedOriginAcceptsRequestHost(t *testing.T) {
	t.Setenv("APP_ALLOWED_ORIGINS", "")
	t.Setenv("APP_BASE_URL", "")
	req := httptest.NewRequest(http.MethodPut, "http://192.168.1.10:9000/api/files/f/partial-doc", nil)
	req.Host = "192.168.1.10:9000"
	req.Header.Set("Origin", "http://192.168.1.10:9000")
	if !allowedOrigin(req, req.Header.Get("Origin")) {
		t.Fatal("same-host LAN origin must be accepted")
	}
	if allowedOrigin(req, "https://evil.example") {
		t.Fatal("unrelated origin must be rejected")
	}
}
