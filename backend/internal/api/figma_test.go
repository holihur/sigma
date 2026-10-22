package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestFigmaImportJSONAndExport(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_fig", "Figma User", "figma@example.com", "hash", "#0ea5e9")
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	payload := `{"format":"sigma-figma-v1","name":"Plugin Import","doc":{"pages":[{"id":"p1","name":"Page 1","nodes":{"n1":{"id":"n1","type":"frame","name":"Hero","x":0,"y":0,"width":320,"height":480,"opacity":1,"visible":true,"strokeWidth":1,"children":[],"fontSize":16,"fontFamily":"Inter","fontWeight":400,"lineHeight":1.4,"textAlign":"left","verticalAlign":"top","objectFit":"cover","ts":1}},"rootIds":["n1"],"ts":1}],"tombstones":{},"deletedPages":{}}}`
	req := httptest.NewRequest(http.MethodPost, "/api/figma/import-json?name=From+Plugin", bytes.NewReader([]byte(payload)))
	rec := httptest.NewRecorder()
	a.handleFigmaImportJSON(rec, req, u)
	if rec.Code != http.StatusCreated {
		t.Fatalf("import status %d: %s", rec.Code, rec.Body.String())
	}
	var imported struct {
		File struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"file"`
		Nodes int `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &imported); err != nil {
		t.Fatal(err)
	}
	if imported.File.ID == "" || imported.File.Name != "From Plugin" || imported.Nodes != 1 {
		t.Fatalf("bad import: %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/files/"+imported.File.ID+"/figma-json", nil)
	req.SetPathValue("id", imported.File.ID)
	rec = httptest.NewRecorder()
	a.handleFigmaExport(rec, req, u)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"format":"sigma-figma-v1"`) {
		t.Fatalf("export status %d: %s", rec.Code, rec.Body.String())
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, ".sigma.json") {
		t.Fatalf("missing download filename: %q", cd)
	}
}

func TestFigmaRESTImport(t *testing.T) {
	var api *httptest.Server
	api = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Figma-Token") != "figma-token" {
			t.Errorf("missing token header")
		}
		if r.URL.Path != "/v1/files/AbCdEf123456" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"Figma Cloud","document":{"type":"DOCUMENT","children":[{"type":"CANVAS","name":"Page 1","children":[{"type":"FRAME","name":"Mobile","absoluteBoundingBox":{"x":0,"y":0,"width":390,"height":844},"children":[]}]}]}}`))
	}))
	defer api.Close()
	t.Setenv("FIGMA_API_BASE", api.URL)
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_fig2", "Figma User", "figma2@example.com", "hash", "#0ea5e9")
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	body := `{"url":"https://www.figma.com/file/AbCdEf123456/App","token":"figma-token"}`
	req := httptest.NewRequest(http.MethodPost, "/api/figma/import", strings.NewReader(body))
	rec := httptest.NewRecorder()
	a.handleFigmaImport(rec, req, u)
	if rec.Code != http.StatusCreated {
		t.Fatalf("import status %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"name":"Figma Cloud"`) {
		t.Fatalf("unexpected import: %s", rec.Body.String())
	}
}
