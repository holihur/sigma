package api

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestThumbnailStorageAndLazyListURL(t *testing.T) {
	uploadDir := t.TempDir()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_thumb", "Thumb", "thumb@example.com", "hash", "#0ea5e9")
	f, err := st.CreateFile("f_thumb", "Thumb design", u.ID, `{"pages":[]}`, "blank")
	if err != nil {
		t.Fatal(err)
	}
	legacy := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("legacy-png"))
	if err := st.SetThumbnail(f.ID, legacy); err != nil {
		t.Fatal(err)
	}

	list, err := st.ListFiles(u.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %#v %v", list, err)
	}
	if list[0].Thumbnail != "/api/files/f_thumb/thumbnail" {
		t.Fatalf("list should expose a lazy URL, got %q", list[0].Thumbnail)
	}

	a := New(st, auth.New("secret"), "", uploadDir, "secret")
	req := httptest.NewRequest(http.MethodGet, "/api/files/f_thumb/thumbnail", nil)
	req.SetPathValue("id", f.ID)
	rec := httptest.NewRecorder()
	a.handleGetThumbnail(rec, req, u)
	if rec.Code != http.StatusOK || rec.Body.String() != "legacy-png" {
		t.Fatalf("thumbnail status %d body %q", rec.Code, rec.Body.String())
	}
	raw, err := st.File(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(raw.Thumbnail, "thumbnails/") {
		t.Fatalf("legacy thumbnail was not migrated: %q", raw.Thumbnail)
	}
	if _, err := os.Stat(filepath.Join(uploadDir, filepath.FromSlash(raw.Thumbnail))); err != nil {
		t.Fatalf("thumbnail file missing: %v", err)
	}

	body := `{"thumbnail":"data:image/webp;base64,` + base64.StdEncoding.EncodeToString([]byte("new-webp")) + `"}`
	req = httptest.NewRequest(http.MethodPatch, "/api/files/f_thumb", strings.NewReader(body))
	req.SetPathValue("id", f.ID)
	rec = httptest.NewRecorder()
	a.handlePatchFile(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status %d: %s", rec.Code, rec.Body.String())
	}
	raw, _ = st.File(f.ID)
	if !strings.HasSuffix(raw.Thumbnail, ".webp") {
		t.Fatalf("new thumbnail should be a webp file, got %q", raw.Thumbnail)
	}
}
