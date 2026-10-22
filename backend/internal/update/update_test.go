package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"
)

func TestVersionGreater(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"1.2.4", "1.2.3", true},
		{"v2.0.0", "1.9.9", true},
		{"1.2.3", "1.2.3", false},
		{"1.2.3", "1.3", false},
	}
	for _, c := range cases {
		if got := versionGreater(c.a, c.b); got != c.want {
			t.Fatalf("versionGreater(%q,%q)=%v want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestCheckAndChecksum(t *testing.T) {
	asset := AssetName()
	payload := []byte("#!/bin/sh\necho sigma\n")
	sum := sha256.Sum256(payload)
	var srv *httptest.Server
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tag_name":"v1.4.0","assets":[
			{"name":"` + asset + `","browser_download_url":"` + srv.URL + `/asset"},
			{"name":"checksums.txt","browser_download_url":"` + srv.URL + `/checksums"}]}`))
	})
	mux.HandleFunc("/asset", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(payload) })
	mux.HandleFunc("/checksums", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(hex.EncodeToString(sum[:]) + "  " + asset + "\n"))
	})
	srv = httptest.NewServer(mux)
	defer srv.Close()
	m := New(Config{CurrentVersion: "1.3.0", Repo: "o/r", APIBase: srv.URL, Interval: time.Minute, AutoUpdate: true, Client: srv.Client()})
	st, err := m.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !st.UpdateAvailable || st.LatestVersion != "1.4.0" || st.Asset != asset {
		t.Fatalf("bad status: %#v", st)
	}
	got, err := m.expectedChecksum(context.Background(), srv.URL+"/checksums", asset)
	if err != nil || got != hex.EncodeToString(sum[:]) {
		t.Fatalf("checksum: %q %v", got, err)
	}
	if runtime.GOOS == "" {
		t.Fatal("unreachable")
	}
}
