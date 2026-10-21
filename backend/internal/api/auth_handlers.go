package api

import (
	"crypto/sha256"
	"encoding/binary"
	"net/http"
	"strings"

	"sigma/internal/model"
	"sigma/internal/templates"
)

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
	if len(body.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
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
	token, _ := a.auth.Token(u.ID)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (a *API) handleMe(w http.ResponseWriter, r *http.Request, u model.User) {
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}
