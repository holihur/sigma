package api

import (
	"crypto/sha256"
	"encoding/binary"
	"net/http"
	"strings"

	"sigma/internal/model"
	"sigma/internal/templates"
)

const authCookieName = "sigma_session"

func setAuthCookie(w http.ResponseWriter, r *http.Request, token string) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name: authCookieName, Value: token, Path: "/", MaxAge: 24 * 60 * 60,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func clearAuthCookie(w http.ResponseWriter, r *http.Request) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name: authCookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	clearAuthCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

var avatarColors = []string{"#7c5cff", "#f97316", "#06b6d4", "#ec4899", "#22c55e", "#eab308", "#ef4444", "#3b82f6"}

func colorFor(email string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(email)))
	return avatarColors[binary.BigEndian.Uint32(sum[:4])%uint32(len(avatarColors))]
}

func (a *API) handleTemplates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"templates": templates.List()})
}

func (a *API) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if len(body.Name) < 2 {
		writeError(w, http.StatusBadRequest, "Please enter your name")
		return
	}
	if !strings.Contains(body.Email, "@") || len(body.Email) < 5 {
		writeError(w, http.StatusBadRequest, "Please enter a valid email")
		return
	}
	if len(body.Password) < 10 {
		writeError(w, http.StatusBadRequest, "Password must be at least 10 characters")
		return
	}
	if len(body.Password) > 72 {
		writeError(w, http.StatusBadRequest, "Password must be at most 72 characters")
		return
	}
	hash, err := a.auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create account")
		return
	}
	u, err := a.st.CreateUser(newID("u"), body.Name, body.Email, hash, colorFor(body.Email))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "An account with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "Could not create account")
		return
	}
	token, _ := a.auth.Token(u.ID)
	setAuthCookie(w, r, token)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": u})
}

func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	u, hash, err := a.st.UserByEmail(body.Email)
	if err != nil || !a.auth.CheckPassword(hash, body.Password) {
		writeError(w, http.StatusUnauthorized, "Incorrect email or password")
		return
	}
	if a.st.PasswordDisabled(u.ID) {
		writeError(w, http.StatusForbidden, "This account uses SSO. Sign in with your identity provider.")
		return
	}
	token, _ := a.auth.Token(u.ID)
	setAuthCookie(w, r, token)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (a *API) handleMe(w http.ResponseWriter, r *http.Request, u model.User) {
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (a *API) handleUpdateMe(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		Name   string  `json:"name"`
		Color  string  `json:"color"`
		Avatar *string `json:"avatar"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	name := strings.TrimSpace(body.Name)
	if len([]rune(name)) < 2 || len([]rune(name)) > 60 {
		writeError(w, http.StatusBadRequest, "Name must be between 2 and 60 characters")
		return
	}
	color := u.Color
	if strings.TrimSpace(body.Color) != "" {
		color = strings.ToLower(strings.TrimSpace(body.Color))
		if len(color) != 7 || color[0] != '#' {
			writeError(w, http.StatusBadRequest, "Choose a valid profile color")
			return
		}
		for _, r := range color[1:] {
			if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
				writeError(w, http.StatusBadRequest, "Choose a valid profile color")
				return
			}
		}
	}
	avatar := u.Avatar
	if body.Avatar != nil {
		avatar = strings.TrimSpace(*body.Avatar)
		if avatar != "" && !strings.HasPrefix(avatar, "/api/uploads/") {
			writeError(w, http.StatusBadRequest, "Avatar must be an uploaded Sigma image")
			return
		}
	}
	updated, err := a.st.UpdateUserProfile(u.ID, name, color, avatar)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}
