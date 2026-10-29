package api

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	"sigma/internal/doc"
	"sigma/internal/model"
	"sigma/internal/ws"
)

// ---------- versions ----------

func (a *API) handleListVersions(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	versions, err := a.st.Versions(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load versions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions})
}

func (a *API) handleCreateVersion(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You do not have edit access")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	_ = readJSON(r, &body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Version " + time.Now().UTC().Format("Jan 2, 15:04")
	}
	if len(name) > 120 {
		name = name[:120]
	}
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	if err := a.st.AddVersion(newID("v"), id, name, f.Doc, f.Version, u.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save version")
		return
	}
	versions, _ := a.st.Versions(id)
	writeJSON(w, http.StatusCreated, map[string]any{"versions": versions})
}

func (a *API) handleRestoreVersion(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	versionID := r.PathValue("versionId")
	role := a.accessRole(id, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You do not have edit access")
		return
	}
	versionDoc, version, err := a.st.VersionDoc(id, versionID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Version not found")
		return
	}
	lock := a.fileLock(id)
	lock.Lock()
	defer lock.Unlock()
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	_ = a.st.AddVersion(newID("v"), id, "Autosave before restore", f.Doc, f.Version, u.ID)
	next := f.Version + 1
	var currentDoc, restoredDoc doc.Doc
	_ = json.Unmarshal([]byte(f.Doc), &currentDoc)
	if err := json.Unmarshal([]byte(versionDoc), &restoredDoc); err != nil {
		writeError(w, http.StatusBadRequest, "Version is corrupted")
		return
	}
	prepared := doc.PrepareRestore(&currentDoc, &restoredDoc, time.Now().UnixMilli())
	raw, err := json.Marshal(prepared)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not restore version")
		return
	}
	if err := a.st.SaveDoc(id, string(raw), next); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not restore version")
		return
	}
	a.hub.BroadcastDoc(id, json.RawMessage(raw), next)
	writeJSON(w, http.StatusOK, map[string]any{"doc": json.RawMessage(raw), "version": next, "restoredFrom": version})
}

// ---------- comments ----------

func (a *API) handleListComments(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	comments, err := a.st.Comments(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load comments")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments})
}

func (a *API) handleCreateComment(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	var body struct {
		PageID   string  `json:"pageId"`
		NodeID   string  `json:"nodeId"`
		ParentID string  `json:"parentId"`
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
		Text     string  `json:"text"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		writeError(w, http.StatusBadRequest, "Comment cannot be empty")
		return
	}
	if len(body.Text) > 4000 {
		body.Text = body.Text[:4000]
	}
	if body.PageID == "" {
		writeError(w, http.StatusBadRequest, "Missing page")
		return
	}
	if math.IsNaN(body.X) || math.IsInf(body.X, 0) || math.IsNaN(body.Y) || math.IsInf(body.Y, 0) ||
		math.Abs(body.X) > 1e6 || math.Abs(body.Y) > 1e6 {
		writeError(w, http.StatusBadRequest, "Invalid comment position")
		return
	}
	if body.ParentID != "" {
		parentFile, err := a.st.CommentFile(body.ParentID)
		if err != nil || parentFile != id {
			writeError(w, http.StatusBadRequest, "Parent comment not found")
			return
		}
	}
	c := model.Comment{
		ID: newID("c"), FileID: id, PageID: body.PageID, NodeID: body.NodeID, ParentID: body.ParentID,
		X: body.X, Y: body.Y, Text: body.Text, AuthorID: u.ID, Author: u.Name,
		Color: u.Color, CreatedAt: model.Now(),
	}
	if err := a.st.AddComment(c); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not add comment")
		return
	}
	// Notify collaborators and push the comment to everyone in the file room.
	if users, err := a.st.AccessUsers(id); err == nil {
		text := truncateRunes(c.Text, 160)
		for _, uid := range users {
			if uid == u.ID {
				continue
			}
			_ = a.st.AddNotificationFor(newID("ntf"), uid, id, c.ID, u.ID, "comment", text)
		}
	}
	a.hub.BroadcastComment(id, c)
	writeJSON(w, http.StatusCreated, map[string]any{"comment": c})
}

func (a *API) handlePatchComment(w http.ResponseWriter, r *http.Request, u model.User) {
	commentID := r.PathValue("id")
	fileID, err := a.st.CommentFile(commentID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Comment not found")
		return
	}
	if a.accessRole(fileID, u) == "" {
		writeError(w, http.StatusNotFound, "Comment not found")
		return
	}
	var body struct {
		Resolved *bool `json:"resolved"`
	}
	if err := readJSON(r, &body); err != nil || body.Resolved == nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if err := a.st.UpdateComment(commentID, *body.Resolved); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update comment")
		return
	}
	comments, _ := a.st.Comments(fileID)
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments})
}

func (a *API) handleDeleteComment(w http.ResponseWriter, r *http.Request, u model.User) {
	commentID := r.PathValue("id")
	fileID, err := a.st.CommentFile(commentID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Comment not found")
		return
	}
	role := a.accessRole(fileID, u)
	if role == "" {
		writeError(w, http.StatusNotFound, "Comment not found")
		return
	}
	author, _ := a.st.CommentAuthor(commentID)
	if author != u.ID && role != "owner" {
		writeError(w, http.StatusForbidden, "You can only delete your own comments")
		return
	}
	parentID, _ := a.st.CommentParent(commentID)
	if parentID == "" {
		_ = a.st.DeleteCommentReplies(commentID)
	}
	if err := a.st.DeleteComment(commentID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete comment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- members ----------

func (a *API) handleListMembers(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	members, err := a.st.Members(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load collaborators")
		return
	}
	meta, _ := a.st.FileMeta(id, u.ID)
	writeJSON(w, http.StatusOK, map[string]any{"members": members, "owner": meta.OwnerName, "ownerId": meta.OwnerID, "role": role})
}

func (a *API) handleAddMember(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can invite collaborators")
		return
	}
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	target, _, err := a.st.UserByEmail(body.Email)
	if err != nil {
		writeError(w, http.StatusNotFound, "No Sigma account found for that email")
		return
	}
	if target.ID == u.ID {
		writeError(w, http.StatusBadRequest, "You already own this design")
		return
	}
	if body.Role != "view" {
		body.Role = "edit"
	}
	if err := a.st.AddMember(id, target.ID, body.Role); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not invite collaborator")
		return
	}
	members, _ := a.st.Members(id)
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (a *API) handleRemoveMember(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	targetID := r.PathValue("userId")
	if a.accessRole(id, u) != "owner" {
		writeError(w, http.StatusForbidden, "Only the owner can remove collaborators")
		return
	}
	if err := a.st.RemoveMember(id, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove collaborator")
		return
	}
	members, _ := a.st.Members(id)
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (a *API) wsAccess(fileID, token string) (ws.User, error) {
	uid, err := a.auth.Parse(token)
	if err != nil {
		return ws.User{}, err
	}
	u, err := a.st.UserByID(uid)
	if err != nil {
		return ws.User{}, err
	}
	role := a.st.RoleFor(fileID, uid)
	if role == "" {
		return ws.User{}, docError("no access")
	}
	return ws.User{ID: u.ID, Name: u.Name, Color: u.Color, Role: role}, nil
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}
