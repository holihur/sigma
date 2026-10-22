package api

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestOIDCLoginCallbackExchange(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	nonce := ""
	var issuer string
	var srv *httptest.Server
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{
			"issuer": issuer, "authorization_endpoint": issuer + "/authorize",
			"token_endpoint": issuer + "/token", "jwks_uri": issuer + "/jwks",
			"userinfo_endpoint": issuer + "/userinfo", "id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes())
		writeJSON(w, 200, map[string]any{"keys": []map[string]any{{"kty": "RSA", "kid": "test", "use": "sig", "alg": "RS256", "n": n, "e": e}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		claims := jwt.MapClaims{
			"iss": issuer, "sub": "sso-subject-1", "aud": "sigma-test", "exp": time.Now().Add(time.Hour).Unix(),
			"iat": time.Now().Unix(), "nonce": nonce, "email": "sso@example.com", "email_verified": true, "name": "SSO User",
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		tok.Header["kid"] = "test"
		signed, _ := tok.SignedString(key)
		writeJSON(w, 200, map[string]any{"access_token": "access", "token_type": "Bearer", "id_token": signed})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"sub": "sso-subject-1", "email": "sso@example.com", "name": "SSO User"})
	})
	srv = httptest.NewServer(mux)
	defer srv.Close()
	issuer = srv.URL

	t.Setenv("OIDC_ISSUER", issuer)
	t.Setenv("OIDC_CLIENT_ID", "sigma-test")
	t.Setenv("OIDC_CLIENT_SECRET", "secret")
	t.Setenv("OIDC_REDIRECT_URL", "http://localhost:9000/api/auth/oidc/callback")
	t.Setenv("APP_BASE_URL", "http://localhost:9000")

	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	if a.oidc == nil {
		t.Fatal("OIDC not enabled")
	}

	// Begin the flow and inspect the generated authorization URL.
	req := httptest.NewRequest(http.MethodGet, "/api/auth/oidc/login?returnTo=/", nil)
	rec := httptest.NewRecorder()
	a.handleOIDCLogin(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("login status %d: %s", rec.Code, rec.Body.String())
	}
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	state := loc.Query().Get("state")
	nonce = loc.Query().Get("nonce")
	if state == "" || nonce == "" {
		t.Fatalf("missing state/nonce: %s", loc.String())
	}
	// In the real flow the browser visits the provider first. For this test we
	// go straight to the callback with the provider-issued code.
	req = httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=test-code&state="+url.QueryEscape(state), nil)
	rec = httptest.NewRecorder()
	a.handleOIDCCallback(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("callback status %d: %s", rec.Code, rec.Body.String())
	}
	dest, _ := url.Parse(rec.Header().Get("Location"))
	oneTime := dest.Query().Get("oidc_code")
	if oneTime == "" {
		t.Fatalf("missing oidc_code: %s", dest.String())
	}
	body, _ := json.Marshal(map[string]string{"code": oneTime})
	req = httptest.NewRequest(http.MethodPost, "/api/auth/oidc/exchange", bytes.NewReader(body))
	rec = httptest.NewRecorder()
	a.handleOIDCExchange(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("exchange status %d: %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Token string `json:"token"`
		User  struct {
			ID    string `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Token == "" || out.User.Email != "sso@example.com" {
		t.Fatalf("bad exchange: %s", rec.Body.String())
	}
	if _, err := st.UserByIdentity(issuer, "sso-subject-1"); err != nil {
		t.Fatalf("identity not linked: %v", err)
	}

	// A second sign-in must resolve to the same account.
	req = httptest.NewRequest(http.MethodGet, "/api/auth/oidc/login", nil)
	rec = httptest.NewRecorder()
	a.handleOIDCLogin(rec, req)
	loc, _ = url.Parse(rec.Header().Get("Location"))
	state = loc.Query().Get("state")
	nonce = loc.Query().Get("nonce")
	req = httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=test-code&state="+url.QueryEscape(state), nil)
	rec = httptest.NewRecorder()
	a.handleOIDCCallback(rec, req)
	dest, _ = url.Parse(rec.Header().Get("Location"))
	body, _ = json.Marshal(map[string]string{"code": dest.Query().Get("oidc_code")})
	req = httptest.NewRequest(http.MethodPost, "/api/auth/oidc/exchange", bytes.NewReader(body))
	rec = httptest.NewRecorder()
	a.handleOIDCExchange(rec, req)
	var out2 struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out2)
	if out2.User.ID != out.User.ID {
		t.Fatalf("SSO user changed: %s vs %s", out.User.ID, out2.User.ID)
	}
	if !strings.HasPrefix(issuer, "http") || fmt.Sprint(issuer) == "" {
		t.Fatal("unreachable")
	}
}
