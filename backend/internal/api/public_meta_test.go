package api

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"sigma/internal/auth"
	"sigma/internal/store"
)

const testIndexHTML = `<!doctype html><html><head><title>Sigma — Prototype design, together</title></head><body><div id="root"></div></body></html>`

func TestPublicPrototypeHTMLMeta(t *testing.T) {
	t.Setenv("APP_BASE_URL", "https://sigma.test")
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_meta", "Mina", "mina@example.com", "hash", "#0ea5e9")
	f, err := st.CreateFile("f_meta", "Checkout flow", u.ID, `{"pages":[]}`, "blank")
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SetThumbnail(f.ID, "data:image/png;base64,"+base64.StdEncoding.EncodeToString([]byte("png-data"))); err != nil {
		t.Fatal(err)
	}
	if err := st.SetPublicLink(f.ID, "tok_meta", true, 0, ""); err != nil {
		t.Fatal(err)
	}
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	a.staticFS = fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(testIndexHTML)}}
	handler := a.Handler()

	req := httptest.NewRequest(http.MethodGet, "https://sigma.test/p/tok_meta", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"<title>Checkout flow — Sigma prototype</title>",
		`property="og:title" content="Checkout flow — Sigma prototype"`,
		`property="og:description" content="Interactive prototype by Mina — built with Sigma."`,
		`property="og:url" content="https://sigma.test/p/tok_meta"`,
		`property="og:image" content="https://sigma.test/api/public/tok_meta/thumbnail"`,
		`name="twitter:card" content="summary_large_image"`,
		`rel="canonical" href="https://sigma.test/p/tok_meta"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in:\n%s", want, body)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "https://sigma.test/api/public/tok_meta/thumbnail", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("thumbnail status %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("content-type %q", got)
	}
	if rec.Body.String() != "png-data" {
		t.Fatalf("thumbnail body %q", rec.Body.String())
	}
}

func TestPublicPrototypeHTMLPasswordDoesNotLeak(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_private", "Owner", "owner@example.com", "hash", "#0ea5e9")
	f, err := st.CreateFile("f_private", "Secret client work", u.ID, `{"pages":[]}`, "blank")
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SetPublicLink(f.ID, "tok_private", true, 0, "hash"); err != nil {
		t.Fatal(err)
	}
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	a.staticFS = fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(testIndexHTML)}}
	handler := a.Handler()

	req := httptest.NewRequest(http.MethodGet, "https://sigma.test/p/tok_private", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "Secret client work") {
		t.Fatalf("password-protected prototype leaked its name:\n%s", body)
	}
	if !strings.Contains(body, `name="robots" content="noindex, nofollow"`) {
		t.Fatalf("missing noindex meta:\n%s", body)
	}
	if got := rec.Header().Get("X-Robots-Tag"); got != "noindex, nofollow" {
		t.Fatalf("X-Robots-Tag %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "https://sigma.test/api/public/tok_private/thumbnail", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("password-protected thumbnail status %d", rec.Code)
	}
}
