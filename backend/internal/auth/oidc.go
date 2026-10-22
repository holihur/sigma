package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	AppBaseURL   string
	Scopes       []string
	Label        string
}

type OIDCManager struct {
	cfg OIDCConfig
	mu  sync.Mutex

	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config

	states    map[string]oidcState
	exchanges map[string]exchangeState
}

type oidcState struct {
	Nonce     string
	Verifier  string
	ReturnTo  string
	ExpiresAt time.Time
}

type exchangeState struct {
	UserID    string
	ReturnTo  string
	ExpiresAt time.Time
}

type OIDCClaims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
}

func NewOIDCFromEnv() *OIDCManager {
	issuer := strings.TrimSpace(os.Getenv("OIDC_ISSUER"))
	clientID := strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID"))
	if issuer == "" || clientID == "" {
		return nil
	}
	appBase := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/")
	if appBase == "" {
		appBase = "http://localhost:9000"
	}
	redirect := strings.TrimSpace(os.Getenv("OIDC_REDIRECT_URL"))
	if redirect == "" {
		redirect = appBase + "/api/auth/oidc/callback"
	}
	scopes := strings.Fields(os.Getenv("OIDC_SCOPES"))
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}
	hasOpenID := false
	for _, s := range scopes {
		if s == oidc.ScopeOpenID {
			hasOpenID = true
		}
	}
	if !hasOpenID {
		scopes = append([]string{oidc.ScopeOpenID}, scopes...)
	}
	label := strings.TrimSpace(os.Getenv("OIDC_LABEL"))
	if label == "" {
		label = "Single sign-on"
	}
	return &OIDCManager{
		cfg: OIDCConfig{
			Issuer: issuer, ClientID: clientID, ClientSecret: strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET")),
			RedirectURL: redirect, AppBaseURL: appBase, Scopes: scopes, Label: label,
		},
		states:    map[string]oidcState{},
		exchanges: map[string]exchangeState{},
	}
}

func (m *OIDCManager) Enabled() bool { return m != nil }
func (m *OIDCManager) Label() string {
	if m == nil {
		return ""
	}
	return m.cfg.Label
}

func (m *OIDCManager) Issuer() string {
	if m == nil {
		return ""
	}
	return strings.TrimRight(m.cfg.Issuer, "/")
}

func (m *OIDCManager) AppBaseURL() string {
	if m == nil {
		return ""
	}
	return m.cfg.AppBaseURL
}

func (m *OIDCManager) initProvider(ctx context.Context) error {
	if m.provider != nil {
		return nil
	}
	p, err := oidc.NewProvider(ctx, m.cfg.Issuer)
	if err != nil {
		return fmt.Errorf("OIDC discovery failed: %w", err)
	}
	m.provider = p
	m.verifier = p.Verifier(&oidc.Config{ClientID: m.cfg.ClientID})
	m.oauth = &oauth2.Config{
		ClientID: m.cfg.ClientID, ClientSecret: m.cfg.ClientSecret,
		Endpoint: p.Endpoint(), RedirectURL: m.cfg.RedirectURL, Scopes: m.cfg.Scopes,
	}
	return nil
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func cleanReturnTo(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || !strings.HasPrefix(v, "/") || strings.HasPrefix(v, "//") {
		return "/"
	}
	return v
}

func (m *OIDCManager) cleanupLocked() {
	now := time.Now()
	for k, v := range m.states {
		if now.After(v.ExpiresAt) {
			delete(m.states, k)
		}
	}
	for k, v := range m.exchanges {
		if now.After(v.ExpiresAt) {
			delete(m.exchanges, k)
		}
	}
}

func (m *OIDCManager) Begin(ctx context.Context, returnTo string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.initProvider(ctx); err != nil {
		return "", err
	}
	m.cleanupLocked()
	state, err := randomString(24)
	if err != nil {
		return "", err
	}
	nonce, err := randomString(24)
	if err != nil {
		return "", err
	}
	verifier, err := randomString(48)
	if err != nil {
		return "", err
	}
	m.states[state] = oidcState{Nonce: nonce, Verifier: verifier, ReturnTo: cleanReturnTo(returnTo), ExpiresAt: time.Now().Add(10 * time.Minute)}
	return m.oauth.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.S256ChallengeOption(verifier),
	), nil
}

func (m *OIDCManager) Exchange(ctx context.Context, code, state string) (OIDCClaims, string, error) {
	m.mu.Lock()
	st, ok := m.states[state]
	if ok {
		delete(m.states, state)
	}
	m.mu.Unlock()
	if !ok || time.Now().After(st.ExpiresAt) {
		return OIDCClaims{}, "", errors.New("sign-in session expired; please try again")
	}
	if err := m.initProvider(ctx); err != nil {
		return OIDCClaims{}, "", err
	}
	tok, err := m.oauth.Exchange(ctx, code, oauth2.VerifierOption(st.Verifier))
	if err != nil {
		return OIDCClaims{}, "", fmt.Errorf("code exchange failed: %w", err)
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		return OIDCClaims{}, "", errors.New("identity provider did not return an ID token")
	}
	idToken, err := m.verifier.Verify(ctx, rawID)
	if err != nil {
		return OIDCClaims{}, "", fmt.Errorf("invalid ID token: %w", err)
	}
	if idToken.Nonce != "" && idToken.Nonce != st.Nonce {
		return OIDCClaims{}, "", errors.New("invalid ID token nonce")
	}
	var claims OIDCClaims
	if err := idToken.Claims(&claims); err != nil {
		return OIDCClaims{}, "", err
	}
	if claims.Email == "" {
		if ui, err := m.provider.UserInfo(ctx, oauth2.StaticTokenSource(tok)); err == nil {
			var extra OIDCClaims
			if ui.Claims(&extra) == nil {
				if claims.Email == "" {
					claims.Email = extra.Email
				}
				if claims.Name == "" {
					claims.Name = extra.Name
				}
				if claims.PreferredUsername == "" {
					claims.PreferredUsername = extra.PreferredUsername
				}
			}
		}
	}
	if claims.Email == "" && strings.Contains(claims.PreferredUsername, "@") {
		claims.Email = claims.PreferredUsername
	}
	if claims.Subject == "" || claims.Email == "" {
		return OIDCClaims{}, "", errors.New("identity provider did not return a subject and email")
	}
	return claims, st.ReturnTo, nil
}

func (m *OIDCManager) CreateExchange(userID, returnTo string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cleanupLocked()
	code, err := randomString(24)
	if err != nil {
		return "", err
	}
	m.exchanges[code] = exchangeState{UserID: userID, ReturnTo: cleanReturnTo(returnTo), ExpiresAt: time.Now().Add(2 * time.Minute)}
	return code, nil
}

func (m *OIDCManager) ConsumeExchange(code string) (string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cleanupLocked()
	st, ok := m.exchanges[code]
	if ok {
		delete(m.exchanges, code)
	}
	if !ok || time.Now().After(st.ExpiresAt) {
		return "", "", errors.New("sign-in code expired")
	}
	return st.UserID, st.ReturnTo, nil
}

// RandomPassword is used for passwordless SSO accounts so the account cannot
// be entered through the regular password form.
func RandomPassword() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func OIDCErrorURL(base, message string) string {
	return base + "/login?oidc_error=" + url.QueryEscape(message)
}
