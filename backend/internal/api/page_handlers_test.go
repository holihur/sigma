package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/doc"
	"sigma/internal/store"
)

const twoPageDoc = `{"pages":[
 {"id":"p1","name":"Page 1","ts":1,"rootIds":["n1"],"nodes":{"n1":{"id":"n1","type":"rect","name":"One","x":0,"y":0,"width":10,"height":10,"children":[],"ts":1}}},
 {"id":"p2","name":"Page 2","ts":1,"rootIds":["n2"],"nodes":{"n2":{"id":"n2","type":"rect","name":"Two","x":0,"y":0,"width":10,"height":10,"children":[],"ts":1}}}
],"tombstones":{}}`

func newPageTestAPI(t *testing.T) (*API, string) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	u, _ := st.CreateUser("u_pages", "Pages", "pages@example.com", "hash", "#0ea5e9")
	f, err := st.CreateFile("f_pages", "Paged", u.ID, twoPageDoc, "blank")
	if err != nil {
		t.Fatal(err)
	}
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")
	return a, f.ID
}

func TestManifestAndPageEndpoints(t *testing.T) {
	a, fileID := newPageTestAPI(t)
	u, _ := a.st.UserByID("u_pages")

	req := httptest.NewRequest(http.MethodGet, "/api/files/"+fileID+"/manifest", nil)
	req.SetPathValue("id", fileID)
	rec := httptest.NewRecorder()
	a.handleGetManifest(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("manifest status %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"n1"`) {
		t.Fatalf("manifest must not contain node data: %s", rec.Body.String())
	}
	var manifest struct {
		Pages []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"pages"`
		Version int `json:"version"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Pages) != 2 || manifest.Version != 1 {
		t.Fatalf("unexpected manifest: %#v", manifest)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/files/"+fileID+"/pages/p2", nil)
	req.SetPathValue("id", fileID)
	req.SetPathValue("pageId", "p2")
	rec = httptest.NewRecorder()
	a.handleGetPage(rec, req, u)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"id":"p2"`) {
		t.Fatalf("page status %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"id":"p1"`) {
		t.Fatalf("page endpoint leaked another page: %s", rec.Body.String())
	}
}

func TestPartialSaveKeepsOtherPages(t *testing.T) {
	a, fileID := newPageTestAPI(t)
	u, _ := a.st.UserByID("u_pages")

	body := `{"doc":{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["n1"],"nodes":{"n1":{"id":"n1","type":"rect","name":"One edited","x":1,"y":0,"width":10,"height":10,"children":[],"ts":2}}}],"tombstones":{},"deletedPages":{}}}`
	req := httptest.NewRequest(http.MethodPut, "/api/files/"+fileID+"/partial-doc", strings.NewReader(body))
	req.SetPathValue("id", fileID)
	rec := httptest.NewRecorder()
	a.handlePutPartialDoc(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("partial save status %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"id":"p2"`) {
		t.Fatalf("partial response should not include unloaded p2: %s", rec.Body.String())
	}

	f, err := a.st.File(fileID)
	if err != nil {
		t.Fatal(err)
	}
	var stored doc.Doc
	if err := json.Unmarshal([]byte(f.Doc), &stored); err != nil {
		t.Fatal(err)
	}
	if len(stored.Pages) != 2 {
		t.Fatalf("partial save deleted pages: %#v", stored.Pages)
	}
	if _, ok := stored.Pages[1].Nodes["n2"]; !ok {
		t.Fatalf("unloaded page was corrupted: %#v", stored.Pages[1])
	}
	if !strings.Contains(string(stored.Pages[0].Nodes["n1"]), "One edited") {
		t.Fatalf("loaded page did not save: %s", stored.Pages[0].Nodes["n1"])
	}
}
