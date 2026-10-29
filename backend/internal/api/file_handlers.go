package api

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	"sigma/internal/design"
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
		Folder   string `json:"folder"`
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
	if folder := strings.TrimSpace(body.Folder); folder != "" {
		if len(folder) > 80 {
			folder = folder[:80]
		}
		if err := a.st.SetFolder(f.ID, folder); err == nil {
			f.Folder = folder
		}
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
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"file": meta, "doc": json.RawMessage(f.Doc)})
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
		Starred   *bool   `json:"starred"`
		Folder    *string `json:"folder"`
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
		thumb := strings.TrimSpace(*body.Thumbnail)
		if thumb == "" {
			if err := a.st.SetThumbnail(id, ""); err != nil {
				writeError(w, http.StatusInternalServerError, "Could not save thumbnail")
				return
			}
		} else {
			stored, err := a.saveThumbnailDataURL(id, thumb)
			if err != nil {
				writeError(w, http.StatusBadRequest, "Invalid thumbnail")
				return
			}
			if err := a.st.SetThumbnail(id, stored); err != nil {
				writeError(w, http.StatusInternalServerError, "Could not save thumbnail")
				return
			}
		}
	}
	if body.Starred != nil {
		if err := a.st.SetStar(id, u.ID, *body.Starred); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not update star")
			return
		}
	}
	if body.Folder != nil {
		if role == "view" {
			writeError(w, http.StatusForbidden, "View-only access")
			return
		}
		folder := strings.TrimSpace(*body.Folder)
		if len(folder) > 80 {
			folder = folder[:80]
		}
		if err := a.st.SetFolder(id, folder); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not move design")
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
	a.removeThumbnail(f.Thumbnail)
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
	if f.Folder != "" {
		_ = a.st.SetFolder(meta.ID, f.Folder)
		meta.Folder = f.Folder
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
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"doc": json.RawMessage(f.Doc), "version": f.Version})
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
	// Keep collaborators in sync with the touched subset, not the full doc.
	var inc, full doc.Doc
	if json.Unmarshal(body.Doc, &inc) == nil && json.Unmarshal(merged, &full) == nil {
		if applied, err := json.Marshal(doc.DeltaResult(&full, &inc)); err == nil {
			a.hub.BroadcastDelta(id, applied, version)
		}
	}
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"doc": merged, "version": version})
}

// mergeAndSave merges incoming into the stored document with per-node LWW
// semantics, then persists it with an incremented version.
func (a *API) mergeAndSave(fileID string, incoming json.RawMessage) (json.RawMessage, int, error) {
	if len(incoming) > 8<<20 {
		return nil, 0, docError("document too large")
	}
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
	if err := validateDocLimits(&inc); err != nil {
		return nil, 0, err
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
	// Keep tombstones for 30 days to allow offline clients to sync, then GC
	cutoff := time.Now().AddDate(0, 0, -30).UnixMilli()
	out := make(map[string]int64, len(in))
	for k, v := range in {
		if v >= cutoff {
			out[k] = v
		}
	}
	return out
}

func validateDocLimits(d *doc.Doc) error {
	if len(d.Pages) > 20 {
		return docError("too many pages (max 20)")
	}
	total := 0
	for _, p := range d.Pages {
		total += len(p.Nodes)
		if len(p.RootIDs) > 1000 {
			return docError("too many root nodes")
		}
		for id, raw := range p.Nodes {
			if err := validateNodeGeometry(raw); err != nil {
				return docError("invalid node " + id + ": " + err.Error())
			}
		}
	}
	if total > 3000 {
		return docError("too many nodes (max 3000)")
	}
	if total == 0 && len(d.Pages) > 0 {
		// Allow empty pages but not completely empty doc
	}
	return nil
}

func validateNodeGeometry(raw json.RawMessage) error {
	// Avoid unmarshalling every node on normal saves. Vector geometry is the
	// only payload where normalized coordinates can be attacker-controlled.
	if !bytes.Contains(raw, []byte(`"points"`)) && !bytes.Contains(raw, []byte(`"subpaths"`)) {
		return nil
	}
	var n design.Node
	if err := json.Unmarshal(raw, &n); err != nil {
		return err
	}
	if !finite(n.X) || !finite(n.Y) || !finite(n.Width) || !finite(n.Height) {
		return docError("non-finite geometry")
	}
	if n.Width < 0 || n.Height < 0 || math.Abs(n.X) > 1e6 || math.Abs(n.Y) > 1e6 {
		return docError("geometry out of range")
	}
	for _, p := range n.Points {
		if err := validateVectorPoint(p); err != nil {
			return err
		}
	}
	for _, sub := range n.Subpaths {
		for _, p := range sub.Points {
			if err := validateVectorPoint(p); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateVectorPoint(p design.VectorPoint) error {
	if !normalized(p.X) || !normalized(p.Y) {
		return docError("vector point outside 0..1")
	}
	for _, h := range []*design.VectorHandle{p.In, p.Out} {
		if h != nil && (!normalized(h.X) || !normalized(h.Y)) {
			return docError("vector handle outside 0..1")
		}
	}
	return nil
}

func normalized(v float64) bool {
	return finite(v) && v >= 0 && v <= 1
}

func finite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

type docError string

func (e docError) Error() string { return string(e) }

const errEmptyDoc = docError("empty document")

// applyDelta merges a partial document from a collaborating client and returns
// the authoritative subset to broadcast back to the room.
func (a *API) applyDelta(fileID string, incoming json.RawMessage) (json.RawMessage, int, error) {
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
	var delta doc.Doc
	if err := json.Unmarshal(incoming, &delta); err != nil {
		return nil, 0, err
	}
	if doc.IsEmptyDelta(&delta) {
		out, err := json.Marshal(doc.Doc{Pages: []doc.Page{}, Tombstones: map[string]int64{}, DeletedPages: map[string]int64{}})
		return out, f.Version, err
	}
	merged := doc.ApplyDelta(&base, &delta)
	merged.Tombstones = pruneTombstones(merged.Tombstones)
	full, err := json.Marshal(merged)
	if err != nil {
		return nil, 0, err
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(fileID, string(full), version); err != nil {
		return nil, 0, err
	}
	applied := doc.DeltaResult(merged, &delta)
	out, err := json.Marshal(applied)
	if err != nil {
		return nil, 0, err
	}
	return out, version, nil
}
