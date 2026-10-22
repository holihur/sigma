package store

import (
	"path/filepath"
	"testing"
)

func TestFileFolders(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "sigma.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	u, err := s.CreateUser("u1", "Demo", "demo@example.com", "hash", "#0ea5e9")
	if err != nil {
		t.Fatal(err)
	}
	f, err := s.CreateFile("f1", "Design", u.ID, `{"pages":[]}`, "blank")
	if err != nil {
		t.Fatal(err)
	}
	if f.Folder != "" {
		t.Fatalf("expected empty folder, got %q", f.Folder)
	}
	if err := s.SetFolder("f1", "Product"); err != nil {
		t.Fatal(err)
	}
	meta, err := s.FileMeta("f1", u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Folder != "Product" {
		t.Fatalf("expected folder Product, got %q", meta.Folder)
	}
	list, err := s.ListFiles(u.ID)
	if err != nil || len(list) != 1 || list[0].Folder != "Product" {
		t.Fatalf("unexpected files: %#v %v", list, err)
	}
}
