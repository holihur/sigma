package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"sigma/internal/design"
	"sigma/internal/figma"
	"sigma/internal/model"
)

func (a *API) figma() *figma.Client {
	c := figma.NewClient()
	if base := strings.TrimSpace(os.Getenv("FIGMA_API_BASE")); base != "" {
		c.BaseURL = base
	}
	return c
}

func (a *API) handleFigmaImport(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		URL   string `json:"url"`
		Token string `json:"token"`
		Name  string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	key, err := figma.ParseFileKey(body.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	data, err := a.figma().Fetch(r.Context(), key, body.Token)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	doc, name, err := figma.ConvertFile(data)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Could not convert Figma file: "+err.Error())
		return
	}
	if strings.TrimSpace(body.Name) != "" {
		name = strings.TrimSpace(body.Name)
	}
	if name == "" {
		name = "Imported Figma design"
	}
	raw, err := doc.Marshal()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	meta, err := a.st.CreateFile(newID("f"), name, u.ID, string(raw), "figma")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"file": meta, "pages": len(doc.Pages), "nodes": countNodes(doc)})
}

func countNodes(doc *design.Doc) int {
	n := 0
	for _, p := range doc.Pages {
		n += len(p.Nodes)
	}
	return n
}

func (a *API) handleFigmaImportJSON(w http.ResponseWriter, r *http.Request, u model.User) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 96<<20))
	_ = r.Body.Close()
	if err != nil {
		writeError(w, http.StatusBadRequest, "Could not read JSON")
		return
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		writeError(w, http.StatusBadRequest, "JSON payload is empty")
		return
	}
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	var doc *design.Doc
	var figmaName string
	var wrapper struct {
		Format string          `json:"format"`
		Name   string          `json:"name"`
		Doc    json.RawMessage `json:"doc"`
	}
	if json.Unmarshal(body, &wrapper) == nil && len(wrapper.Doc) > 0 {
		if strings.HasPrefix(wrapper.Format, "sigma") || wrapper.Name != "" {
			doc, err = design.Parse(string(wrapper.Doc))
			figmaName = wrapper.Name
		}
	}
	if doc == nil {
		var probe map[string]json.RawMessage
		_ = json.Unmarshal(body, &probe)
		if _, ok := probe["document"]; ok {
			doc, figmaName, err = figma.ConvertFile(body)
		} else if _, ok := probe["pages"]; ok {
			doc, err = design.Parse(string(body))
		} else {
			err = fmt.Errorf("expected a Sigma document, a Sigma/Figma export wrapper, or a Figma REST file response")
		}
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Could not import JSON: "+err.Error())
		return
	}
	if len(doc.Pages) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "The imported document has no pages")
		return
	}
	if name == "" {
		name = figmaName
	}
	if name == "" {
		name = "Imported design"
	}
	raw, err := doc.Marshal()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	meta, err := a.st.CreateFile(newID("f"), name, u.ID, string(raw), "figma")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"file": meta, "pages": len(doc.Pages), "nodes": countNodes(doc)})
}

func (a *API) handleFigmaExport(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}
	f, err := a.st.File(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}
	if !json.Valid([]byte(f.Doc)) {
		writeError(w, http.StatusInternalServerError, "Stored document is invalid")
		return
	}
	payload, err := json.Marshal(map[string]any{
		"format": "sigma-figma-v1",
		"name":   f.Name,
		"doc":    json.RawMessage(f.Doc),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	filename := safeFilename(f.Name) + ".sigma.json"
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func safeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "sigma-design"
	}
	var b strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		} else if r == ' ' {
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-._")
	if out == "" {
		return "sigma-design"
	}
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}
