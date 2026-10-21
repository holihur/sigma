package api

import (
	"encoding/json"
	"net/http"

	"sigma/internal/model"
	"sigma/internal/store"
)

func (a *API) handleGetPublicLink(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can manage the public link")
		return
	}
	token, enabled, err := a.st.PublicLink(id)
	if err != nil && !store.ErrNotFound(err) {
		writeError(w, http.StatusInternalServerError, "Could not load public link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "enabled": enabled})
}

func (a *API) handleSetPublicLink(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can manage the public link")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	token, _, err := a.st.PublicLink(id)
	if err != nil && !store.ErrNotFound(err) {
		writeError(w, http.StatusInternalServerError, "Could not load public link")
		return
	}
	if token == "" {
		token = newToken()
	}
	if err := a.st.SetPublicLink(id, token, body.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update public link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "enabled": body.Enabled})
}

func (a *API) handlePublicFile(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	f, err := a.st.FileByPublicToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "This prototype link is unavailable")
		return
	}
	owner, _ := a.st.UserByID(f.OwnerID)
	meta := model.FileMeta{
		ID:        f.ID,
		Name:      f.Name,
		OwnerID:   f.OwnerID,
		OwnerName: owner.Name,
		Version:   f.Version,
		Thumbnail: f.Thumbnail,
		Template:  f.Template,
		Role:      "view",
		UpdatedAt: f.UpdatedAt,
		CreatedAt: f.CreatedAt,
	}
	writeJSON(w, http.StatusOK, map[string]any{"file": meta, "doc": json.RawMessage(f.Doc)})
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
