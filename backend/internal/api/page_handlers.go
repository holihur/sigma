package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"sigma/internal/doc"
	"sigma/internal/model"
)

type pageManifestEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	TS   int64  `json:"ts"`
}

func (a *API) handleGetManifest(w http.ResponseWriter, r *http.Request, u model.User) {
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
	var d doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &d); err != nil {
		writeError(w, http.StatusInternalServerError, "Design document is corrupted")
		return
	}
	pages := make([]pageManifestEntry, 0, len(d.Pages))
	for _, p := range d.Pages {
		pages = append(pages, pageManifestEntry{ID: p.ID, Name: p.Name, TS: p.TS})
	}
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{
		"file": meta, "version": f.Version, "pages": pages, "styles": d.Styles,
	})
}

func (a *API) handleGetPages(w http.ResponseWriter, r *http.Request, u model.User) {
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
	var d doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &d); err != nil {
		writeError(w, http.StatusInternalServerError, "Design document is corrupted")
		return
	}
	ids := map[string]bool{}
	for _, part := range strings.Split(r.URL.Query().Get("ids"), ",") {
		if part = strings.TrimSpace(part); part != "" {
			ids[part] = true
		}
	}
	pages := make([]doc.Page, 0, len(d.Pages))
	for _, p := range d.Pages {
		if len(ids) == 0 || ids[p.ID] {
			pages = append(pages, p)
		}
	}
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{
		"doc": map[string]any{
			"pages": pages, "styles": d.Styles,
			"tombstones": d.Tombstones, "deletedPages": d.DeletedPages,
		},
		"version": f.Version,
	})
}

func (a *API) handleGetPage(w http.ResponseWriter, r *http.Request, u model.User) {
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
	var d doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &d); err != nil {
		writeError(w, http.StatusInternalServerError, "Design document is corrupted")
		return
	}
	for _, p := range d.Pages {
		if p.ID == r.PathValue("pageId") {
			writeJSONCompressed(w, r, http.StatusOK, map[string]any{"page": p, "version": f.Version})
			return
		}
	}
	writeError(w, http.StatusNotFound, "Page not found")
}

func (a *API) handleRenamePage(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You do not have edit access")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "Page name cannot be empty")
		return
	}
	if len(name) > 120 {
		name = name[:120]
	}
	lock := a.fileLock(id)
	lock.Lock()
	defer lock.Unlock()
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	var d doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &d); err != nil {
		writeError(w, http.StatusInternalServerError, "Design document is corrupted")
		return
	}
	now := time.Now().UnixMilli()
	found := false
	var changed doc.Page
	for i := range d.Pages {
		if d.Pages[i].ID != r.PathValue("pageId") {
			continue
		}
		d.Pages[i].Name = name
		d.Pages[i].TS = now
		changed = d.Pages[i]
		found = true
		break
	}
	if !found {
		writeError(w, http.StatusNotFound, "Page not found")
		return
	}
	raw, err := json.Marshal(d)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save page")
		return
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(id, string(raw), version); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save page")
		return
	}
	// Send only the renamed page metadata. Its full root IDs are retained so
	// clients with lazy-loaded pages do not clear their existing node tree.
	delta, _ := json.Marshal(doc.Doc{
		Pages: []doc.Page{{
			ID: changed.ID, Name: changed.Name, TS: changed.TS,
			RootIDs: append([]string{}, changed.RootIDs...),
			Nodes:   map[string]json.RawMessage{},
		}},
	})
	a.hub.BroadcastDelta(id, delta, version)
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"page": pageManifestEntry{ID: changed.ID, Name: changed.Name, TS: changed.TS}, "version": version})
}

func (a *API) handleDeletePage(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	role := a.accessRole(id, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You do not have edit access")
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
	var d doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &d); err != nil {
		writeError(w, http.StatusInternalServerError, "Design document is corrupted")
		return
	}
	if len(d.Pages) <= 1 {
		writeError(w, http.StatusBadRequest, "A design needs at least one page")
		return
	}
	found := false
	pages := d.Pages[:0]
	for _, p := range d.Pages {
		if p.ID == r.PathValue("pageId") {
			found = true
			continue
		}
		pages = append(pages, p)
	}
	if !found {
		writeError(w, http.StatusNotFound, "Page not found")
		return
	}
	d.Pages = pages
	if d.DeletedPages == nil {
		d.DeletedPages = map[string]int64{}
	}
	now := time.Now().UnixMilli()
	d.DeletedPages[r.PathValue("pageId")] = now
	raw, err := json.Marshal(d)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete page")
		return
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(id, string(raw), version); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete page")
		return
	}
	delta, _ := json.Marshal(doc.Doc{DeletedPages: map[string]int64{r.PathValue("pageId"): now}})
	a.hub.BroadcastDelta(id, delta, version)
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"ok": true, "version": version})
}

// handlePutPartialDoc merges only the pages supplied by a lazy client and
// returns the applied subset instead of the full document.
func (a *API) handlePutPartialDoc(w http.ResponseWriter, r *http.Request, u model.User) {
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
	applied, version, err := a.mergeAndSaveDelta(id, body.Doc)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Could not save document")
		return
	}
	a.hub.BroadcastDelta(id, applied, version)
	writeJSONCompressed(w, r, http.StatusOK, map[string]any{"doc": json.RawMessage(applied), "version": version})
}

func (a *API) mergeAndSaveDelta(fileID string, incoming json.RawMessage) (json.RawMessage, int, error) {
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
	if doc.IsEmptyDelta(&inc) {
		out, err := json.Marshal(doc.Doc{Pages: []doc.Page{}, Tombstones: map[string]int64{}, DeletedPages: map[string]int64{}})
		return out, f.Version, err
	}
	if err := validateDocLimits(&inc); err != nil {
		return nil, 0, err
	}
	merged := doc.ApplyDelta(&base, &inc)
	merged.Tombstones = pruneTombstones(merged.Tombstones)
	full, err := json.Marshal(merged)
	if err != nil {
		return nil, 0, err
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(fileID, string(full), version); err != nil {
		return nil, 0, err
	}
	applied := doc.DeltaResult(merged, &inc)
	out, err := json.Marshal(applied)
	if err != nil {
		return nil, 0, err
	}
	return out, version, nil
}
