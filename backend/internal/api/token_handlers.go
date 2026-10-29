package api

import (
	"net/http"
	"strings"
	"time"

	"sigma/internal/auth"
	"sigma/internal/model"
	"sigma/internal/store"
)

func patView(r store.PATRecord) map[string]any {
	return map[string]any{
		"id":         r.ID,
		"name":       r.Name,
		"prefix":     r.Prefix,
		"scopes":     auth.ParseScopes(r.Scopes),
		"lastUsedAt": r.LastUsedAt,
		"expiresAt":  r.ExpiresAt,
		"createdAt":  r.CreatedAt,
	}
}

func (a *API) handleListPATs(w http.ResponseWriter, r *http.Request, u model.User) {
	list, err := a.st.ListPATs(u.ID)
	if err != nil {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, rec := range list {
		out = append(out, patView(rec))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": out})
}

func (a *API) handleCreatePAT(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		Name          string   `json:"name"`
		Scopes        []string `json:"scopes"`
		ExpiresInDays int      `json:"expiresInDays"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "MCP token"
	}
	if len(name) > 80 {
		writeError(w, http.StatusBadRequest, "Token name is too long")
		return
	}
	scopes := []string{}
	for _, s := range body.Scopes {
		s = strings.ToLower(strings.TrimSpace(s))
		if s != "" {
			scopes = append(scopes, s)
		}
	}
	if len(scopes) == 0 {
		scopes = []string{auth.ScopeMCPRead, auth.ScopeMCPWrite}
	}
	scopes = auth.ParseScopes(auth.ScopeString(scopes))
	if !auth.ValidScopes(scopes) {
		writeError(w, http.StatusBadRequest, "Scopes must be mcp:read and/or mcp:write")
		return
	}
	days := body.ExpiresInDays
	if days < 0 {
		days = 0
	}
	if days > 3650 {
		days = 3650
	}
	expires := ""
	if days > 0 {
		expires = time.Now().UTC().AddDate(0, 0, days).Format(time.RFC3339)
	}
	raw, hash, prefix, err := auth.NewPAT()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create token")
		return
	}
	rec := store.PATRecord{
		ID: newID("pat"), UserID: u.ID, Name: name, Prefix: prefix, TokenHash: hash,
		Scopes: auth.ScopeString(scopes), ExpiresAt: expires, CreatedAt: model.Now(),
	}
	if err := a.st.CreatePAT(rec); err != nil {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": raw, "pat": patView(rec)})
}

func (a *API) handleDeletePAT(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if err := a.st.DeletePAT(id, u.ID); err != nil {
		if store.ErrNotFound(err) {
			writeError(w, http.StatusNotFound, "Token not found")
			return
		}
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// requireMCPAuth accepts either a normal Sigma JWT (full access) or a
// personal access token with explicit MCP scopes. PATs are only accepted on
// the MCP transport, never on the regular REST API.
func (a *API) requireMCPAuth(next func(http.ResponseWriter, *http.Request, model.User, []string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		if token == "" {
			writeError(w, http.StatusUnauthorized, "Missing MCP bearer token")
			return
		}
		if strings.HasPrefix(token, auth.PATPrefix) {
			rec, err := a.st.PATByHash(auth.HashPAT(token))
			if err != nil {
				w.Header().Set("WWW-Authenticate", "Bearer")
				writeError(w, http.StatusUnauthorized, "Invalid personal access token")
				return
			}
			if rec.ExpiresAt != "" {
				if exp, err := time.Parse(time.RFC3339, rec.ExpiresAt); err == nil && time.Now().After(exp) {
					w.Header().Set("WWW-Authenticate", "Bearer")
					writeError(w, http.StatusUnauthorized, "Personal access token expired")
					return
				}
			}
			u, err := a.st.UserByID(rec.UserID)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "Account not found")
				return
			}
			_ = a.st.TouchPAT(rec.ID)
			next(w, r, u, auth.ParseScopes(rec.Scopes), true)
			return
		}
		uid, err := a.auth.Parse(token)
		if err != nil {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeError(w, http.StatusUnauthorized, "Please sign in again")
			return
		}
		u, err := a.st.UserByID(uid)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Account not found")
			return
		}
		next(w, r, u, nil, false)
	}
}
