package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"sigma/internal/doc"
	"sigma/internal/model"
	"sigma/internal/templates"
)

func (a *API) handleListFiles(w http.ResponseWriter, r *http.Request, u model.User) {
	files, err := a.st.ListFiles(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load designs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}

func (a *API) handleCreateFile(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		Name     string `json:"name"`
		Template string `json:"template"`
	}
	_ = readJSON(r, &body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Untitled design"
	}
	if len(name) > 120 {
		name = name[:120]
	}
	if body.Template == "" {
		body.Template = "blank"
	}
	docJSON, ok := templates.Load(body.Template)
	if !ok {
		writeError(w, http.StatusBadRequest, "Unknown template")
		return
	}
	f, err := a.st.CreateFile(newID("f"), name, u.ID, string(docJSON), body.Template)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create design")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"file": f, "doc": json.RawMessage(docJSON)})
}

func (a *API) accessRole(fileID string, u model.User) string {
	return a.st.RoleFor(fileID, u.ID)
}

func (a *API) handleGetFile(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	meta, err := a.st.FileMeta(id, u.ID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"file": meta, "doc": json.RawMessage(f.Doc)})
}

func (a *API) handlePatchFile(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	var body struct {
		Name      *string `json:"name"`
		Thumbnail *string `json:"thumbnail"`
		Starred    *bool   `json:"starred"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if body.Name != nil {
		if role == "view" {
			writeError(w, http.StatusForbidden, "View-only access")
			return
		}
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "Name cannot be empty")
			return
		}
		if len(name) > 120 {
			name = name[:120]
		}
		if err := a.st.RenameFile(id, name); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not rename design")
			return
		}
	}
	if body.Thumbnail != nil {
		if role == "view" {
			writeError(w, http.StatusForbidden, "View-only access")
			return
		}
		if err := a.st.SetThumbnail(id, *body.Thumbnail); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not save thumbnail")
			return
		}
	}
	if body.Starred != nil {
		if err := a.st.SetStar(id, u.ID, *body.Starred); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not update star")
			return
		}
	}
	meta, err := a.st.FileMeta(id, u.ID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"file": meta})
}

func (a *API) handleDeleteFile(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	if f.OwnerID != u.ID {
		writeError(w, http.StatusForbidden, "Only the owner can delete this design")
		return
	}
	if err := a.st.DeleteFile(id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete design")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) handleDuplicateFile(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	name := f.Name + " copy"
	meta, err := a.st.CreateFile(newID("f"), name, u.ID, f.Doc, f.Template)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not duplicate design")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"file": meta})
}

func (a *API) handleGetDoc(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"doc": json.RawMessage(f.Doc), "version": f.Version})
}

func (a *API) handlePutDoc(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You do not have edit access")
		return
	}
	var body struct {
		Doc json.RawMessage `json:"doc"`
	}
	if err := readJSON(r, &body); err != nil || len(body.Doc) == 0 {
		writeError(w, http.StatusBadRequest, "Invalid document")
		return
	}
	merged, version, err := a.mergeAndSave(id, body.Doc)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Could not save document")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"doc": merged, "version": version})
}

// mergeAndSave merges incoming into the stored document with per-node LWW
// semantics, then persists it with an incremented version.
func (a *API) mergeAndSave(fileID string, incoming json.RawMessage) (json.RawMessage, int, error) {
	lock := a.fileLock(fileID)
	lock.Lock()
	defer lock.Unlock()

	f, err := a.st.File(fileID)
	if err != nil {
		return nil, 0, err
	}
	var base doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &base); err != nil {
		base = doc.Doc{}
	}
	var inc doc.Doc
	if err := json.Unmarshal(incoming, &inc); err != nil {
		return nil, 0, err
	}
	if len(inc.Pages) == 0 {
		return nil, 0, errEmptyDoc
	}
	merged := doc.Merge(&base, &inc)
	merged.Tombstones = pruneTombstones(merged.Tombstones)
	b, err := json.Marshal(merged)
	if err != nil {
		return nil, 0, err
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(fileID, string(b), version); err != nil {
		return nil, 0, err
	}
	return b, version, nil
}

func pruneTombstones(in map[string]int64) map[string]int64 {
	if len(in) == 0 {
		return map[string]int64{}
	}
	return in
}

type docError string

func (e docError) Error() string { return string(e) }

const errEmptyDoc = docError("empty document")
