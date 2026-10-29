package api

import (
	"net/http"
	"net/url"
	"strings"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func (a *API) handleOIDCConfig(w http.ResponseWriter, r *http.Request) {
	enabled := a.oidc != nil
	label := ""
	if enabled {
		label = a.oidc.Label()
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled, "label": label})
}

func (a *API) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if a.oidc == nil {
		writeError(w, http.StatusNotFound, "Single sign-on is not configured")
		return
	}
	next, err := a.oidc.Begin(r.Context(), r.URL.Query().Get("returnTo"))
	if err != nil {
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), err.Error()), http.StatusFound)
		return
	}
	http.Redirect(w, r, next, http.StatusFound)
}

func (a *API) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if a.oidc == nil {
		writeError(w, http.StatusNotFound, "Single sign-on is not configured")
		return
	}
	if e := r.URL.Query().Get("error"); e != "" {
		msg := r.URL.Query().Get("error_description")
		if msg == "" {
			msg = e
		}
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), msg), http.StatusFound)
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Missing OIDC authorization code"), http.StatusFound)
		return
	}
	claims, returnTo, err := a.oidc.Exchange(r.Context(), code, state)
	if err != nil {
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), err.Error()), http.StatusFound)
		return
	}
	if !claims.EmailVerified {
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Email not verified by identity provider"), http.StatusFound)
		return
	}
	issuer := ""
	// The issuer is part of the identity key. OIDCManager verifies the token
	// against the configured issuer; keep the same normalized value here.
	issuer = strings.TrimRight(oidcIssuerForIdentity(a), "/")
	u, err := a.st.UserByIdentity(issuer, claims.Subject)
	if err != nil {
		if !store.ErrNotFound(err) {
			http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), err.Error()), http.StatusFound)
			return
		}
		existing, _, lookupErr := a.st.UserByEmail(claims.Email)
		if lookupErr == nil {
			u = existing
		} else if store.ErrNotFound(lookupErr) {
			name := strings.TrimSpace(claims.Name)
			if name == "" {
				name = strings.Split(claims.Email, "@")[0]
			}
			password, _ := auth.RandomPassword()
			hash, hashErr := a.auth.HashPassword(password)
			if hashErr != nil {
				http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Could not create SSO account"), http.StatusFound)
				return
			}
			u, err = a.st.CreateUser(newID("u"), name, claims.Email, hash, colorFor(claims.Email))
			if err != nil {
				http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Could not create SSO account"), http.StatusFound)
				return
			}
			if err := a.st.SetPasswordDisabled(u.ID, true); err != nil {
				http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Could not create SSO account"), http.StatusFound)
				return
			}
		} else {
			http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), lookupErr.Error()), http.StatusFound)
			return
		}
		if err := a.st.LinkIdentity(issuer, claims.Subject, u.ID, claims.Email); err != nil {
			http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), "Could not link SSO identity"), http.StatusFound)
			return
		}
	}
	oneTime, err := a.oidc.CreateExchange(u.ID, returnTo)
	if err != nil {
		http.Redirect(w, r, auth.OIDCErrorURL(a.oidc.AppBaseURL(), err.Error()), http.StatusFound)
		return
	}
	dest := a.oidc.AppBaseURL() + "/login?oidc_code=" + url.QueryEscape(oneTime)
	http.Redirect(w, r, dest, http.StatusFound)
}

func oidcIssuerForIdentity(a *API) string {
	// Keep identity keys stable even if the discovery document uses a slightly
	// different trailing slash. The manager's configuration is the source.
	if a.oidc == nil {
		return ""
	}
	return a.oidc.Issuer()
}

func (a *API) handleOIDCExchange(w http.ResponseWriter, r *http.Request) {
	if a.oidc == nil {
		writeError(w, http.StatusNotFound, "Single sign-on is not configured")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Code) == "" {
		writeError(w, http.StatusBadRequest, "Invalid sign-in code")
		return
	}
	userID, returnTo, err := a.oidc.ConsumeExchange(strings.TrimSpace(body.Code))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	u, err := a.st.UserByID(userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Account not found")
		return
	}
	token, err := a.auth.Token(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	setAuthCookie(w, r, token)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u, "returnTo": returnTo})
}
