package api

import (
	"encoding/json"
	"net/http"
	"time"

	"sigma/internal/model"
	"sigma/internal/store"
)

func (a *API) handleGetPublicLink(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can manage the public link")
		return
	}
	link, err := a.st.PublicLink(id)
	if err != nil && !store.ErrNotFound(err) {
		writeError(w, http.StatusInternalServerError, "Could not load public link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": link.Token, "enabled": link.Enabled, "expiresAt": link.ExpiresAt, "hasPassword": link.PasswordHash != "",
	})
}

func (a *API) handleSetPublicLink(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can manage the public link")
		return
	}
	var body struct {
		Enabled        bool   `json:"enabled"`
		ExpiresAt      int64  `json:"expiresAt"`
		Password       string `json:"password"`
		RemovePassword bool   `json:"removePassword"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.ExpiresAt > 0 && body.ExpiresAt < time.Now().UnixMilli() {
		writeError(w, http.StatusBadRequest, "Expiry must be in the future")
		return
	}
	if body.Password != "" && len(body.Password) < 4 {
		writeError(w, http.StatusBadRequest, "Password must be at least 4 characters")
		return
	}
	current, err := a.st.PublicLink(id)
	if err != nil && !store.ErrNotFound(err) {
		writeError(w, http.StatusInternalServerError, "Could not load public link")
		return
	}
	token := current.Token
	passwordHash := current.PasswordHash
	if body.RemovePassword {
		passwordHash = ""
	}
	if body.Password != "" {
		hash, err := a.auth.HashPassword(body.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not protect public link")
			return
		}
		passwordHash = hash
	}
	if token == "" {
		token = newToken()
	}
	if err := a.st.SetPublicLink(id, token, body.Enabled, body.ExpiresAt, passwordHash); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update public link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token, "enabled": body.Enabled, "expiresAt": body.ExpiresAt, "hasPassword": passwordHash != "",
	})
}

func (a *API) handlePublicFile(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	f, passwordHash, err := a.st.FileByPublicToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "This prototype link is unavailable or expired")
		return
	}
	if passwordHash != "" {
		password := r.Header.Get("X-Sigma-Public-Password")
		if password == "" {
			writeError(w, http.StatusUnauthorized, "This prototype is password protected")
			return
		}
		if !a.auth.CheckPassword(passwordHash, password) {
			writeError(w, http.StatusUnauthorized, "Incorrect password")
			return
		}
	}
	owner, _ := a.st.UserByID(f.OwnerID)
	meta := model.FileMeta{
		ID:        f.ID,
		Name:      f.Name,
		OwnerID:   f.OwnerID,
		OwnerName: owner.Name,
		Version:   f.Version,
		Thumbnail: publicThumbnailURL(token, f.Thumbnail),
		Template:  f.Template,
		Role:      "view",
		UpdatedAt: f.UpdatedAt,
		CreatedAt: f.CreatedAt,
	}
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"file": meta, "doc": json.RawMessage(f.Doc)})
}

func (a *API) handleListNotifications(w http.ResponseWriter, r *http.Request, u model.User) {
	list, err := a.st.Notifications(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notifications")
		return
	}
	unread := 0
	for _, n := range list {
		if !n.Read {
			unread++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": list, "unread": unread})
}

func (a *API) handleReadNotifications(w http.ResponseWriter, r *http.Request, u model.User) {
	if err := a.st.MarkNotificationsRead(u.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
