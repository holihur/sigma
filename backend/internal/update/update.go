// Package update implements GitHub-release based self updates.
package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	DefaultRepo     = "holihur/sigma"
	DefaultInterval = 10 * time.Minute
)

type Config struct {
	CurrentVersion string
	Repo           string
	APIBase        string
	Interval       time.Duration
	AutoUpdate     bool
	Token          string
	Client         *http.Client
}

type Status struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
	AutoUpdate      bool   `json:"autoUpdate"`
	Interval        string `json:"interval"`
	LastChecked     string `json:"lastChecked"`
	LastError       string `json:"lastError"`
	RestartPending  bool   `json:"restartPending"`
	Repo            string `json:"repo"`
	Asset           string `json:"asset"`
}

type Manager struct {
	cfg    Config
	client *http.Client

	mu         sync.Mutex
	status     Status
	assetURL   string
	checksum   string
	applying   bool
	downloaded string
}

type release struct {
	TagName    string `json:"tag_name"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func NewFromEnv(version string) *Manager {
	enabled := true
	if v := strings.TrimSpace(os.Getenv("AUTO_UPDATE")); v != "" {
		enabled = v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
	}
	interval := DefaultInterval
	if v := strings.TrimSpace(os.Getenv("AUTO_UPDATE_INTERVAL")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d >= 30*time.Second {
			interval = d
		}
	}
	repo := strings.TrimSpace(os.Getenv("SIGMA_UPDATE_REPO"))
	if repo == "" {
		repo = DefaultRepo
	}
	apiBase := strings.TrimRight(strings.TrimSpace(os.Getenv("SIGMA_UPDATE_API")), "/")
	if apiBase == "" {
		apiBase = "https://api.github.com"
	}
	return New(Config{
		CurrentVersion: version, Repo: repo, APIBase: apiBase, Interval: interval,
		AutoUpdate: enabled, Token: strings.TrimSpace(os.Getenv("GITHUB_TOKEN")),
		Client: &http.Client{Timeout: 2 * time.Minute},
	})
}

func New(cfg Config) *Manager {
	if cfg.CurrentVersion == "" {
		cfg.CurrentVersion = "dev"
	}
	if cfg.Repo == "" {
		cfg.Repo = DefaultRepo
	}
	if cfg.APIBase == "" {
		cfg.APIBase = "https://api.github.com"
	}
	if cfg.Interval <= 0 {
		cfg.Interval = DefaultInterval
	}
	if cfg.Client == nil {
		cfg.Client = &http.Client{Timeout: 2 * time.Minute}
	}
	return &Manager{cfg: cfg, client: cfg.Client, status: Status{
		CurrentVersion: cfg.CurrentVersion, AutoUpdate: cfg.AutoUpdate,
		Interval: cfg.Interval.String(), Repo: cfg.Repo,
	}}
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

func (m *Manager) CleanupOld() {
	if exe, err := os.Executable(); err == nil {
		_ = os.Remove(exe + ".old")
	}
}

func (m *Manager) Start(ctx context.Context) {
	m.CleanupOld()
	if !m.cfg.AutoUpdate {
		log.Printf("auto-update disabled (current %s)", m.cfg.CurrentVersion)
		return
	}
	log.Printf("auto-update enabled: checking %s every %s", m.cfg.Repo, m.cfg.Interval)
	timer := time.NewTimer(30 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			m.checkAndMaybeApply(ctx)
			timer.Reset(m.cfg.Interval)
		}
	}
}

func (m *Manager) Check(ctx context.Context) (Status, error) {
	_, err := m.check(ctx)
	return m.Status(), err
}

func (m *Manager) checkAndMaybeApply(ctx context.Context) {
	st, err := m.check(ctx)
	if err != nil {
		log.Printf("update check: %v", err)
		return
	}
	if !st.UpdateAvailable || !m.cfg.AutoUpdate {
		return
	}
	if st.CurrentVersion == "dev" {
		log.Printf("update %s available, but current build is dev; skipping auto apply", st.LatestVersion)
		return
	}
	log.Printf("updating %s → %s", st.CurrentVersion, st.LatestVersion)
	if err := m.Apply(ctx); err != nil {
		log.Printf("auto-update failed: %v", err)
		return
	}
	log.Printf("update installed; restarting")
	time.Sleep(time.Second)
	if err := Restart(); err != nil {
		log.Printf("restart failed (new binary is installed, restart manually): %v", err)
	}
}

func (m *Manager) check(ctx context.Context) (Status, error) {
	m.mu.Lock()
	if m.applying {
		st := m.status
		m.mu.Unlock()
		return st, nil
	}
	m.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.cfg.APIBase+"/repos/"+m.cfg.Repo+"/releases/latest", nil)
	if err != nil {
		return m.fail(err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "sigma-updater/"+m.cfg.CurrentVersion)
	if m.cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+m.cfg.Token)
	}
	res, err := m.client.Do(req)
	if err != nil {
		return m.fail(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return m.fail(fmt.Errorf("GitHub release API returned %d: %s", res.StatusCode, strings.TrimSpace(string(body))))
	}
	var rel release
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&rel); err != nil {
		return m.fail(err)
	}
	if rel.Draft || rel.Prerelease {
		return m.fail(errors.New("latest release is a draft or prerelease"))
	}
	assetName := AssetName()
	var assetURL, checksumURL string
	for _, a := range rel.Assets {
		switch a.Name {
		case assetName:
			assetURL = a.URL
		case "checksums.txt":
			checksumURL = a.URL
		}
	}
	latest := strings.TrimPrefix(rel.TagName, "v")
	if assetURL == "" {
		return m.fail(fmt.Errorf("release %s has no asset %s", rel.TagName, assetName))
	}
	available := latest != "" && (m.cfg.CurrentVersion == "dev" || versionGreater(latest, m.cfg.CurrentVersion))
	m.mu.Lock()
	m.status.LatestVersion = latest
	m.status.UpdateAvailable = available
	m.status.LastChecked = time.Now().UTC().Format(time.RFC3339)
	m.status.LastError = ""
	m.status.Asset = assetName
	m.assetURL = assetURL
	m.checksum = checksumURL
	st := m.status
	m.mu.Unlock()
	return st, nil
}

func (m *Manager) fail(err error) (Status, error) {
	m.mu.Lock()
	m.status.LastChecked = time.Now().UTC().Format(time.RFC3339)
	m.status.LastError = err.Error()
	st := m.status
	m.mu.Unlock()
	return st, err
}

func AssetName() string {
	name := "sigma-" + runtime.GOOS + "-" + runtime.GOARCH
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

func versionGreater(a, b string) bool {
	pa := versionParts(a)
	pb := versionParts(b)
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		if x != y {
			return x > y
		}
	}
	return false
}

func versionParts(v string) []int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	v = strings.SplitN(v, "-", 2)[0]
	parts := strings.Split(v, ".")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		n, _ := strconv.Atoi(strings.TrimSpace(p))
		out = append(out, n)
	}
	return out
}

func (m *Manager) Apply(ctx context.Context) error {
	m.mu.Lock()
	if m.cfg.CurrentVersion == "dev" && os.Getenv("SIGMA_ALLOW_DEV_UPDATE") != "1" {
		m.mu.Unlock()
		return errors.New("refusing to overwrite a dev build; set SIGMA_ALLOW_DEV_UPDATE=1 to force")
	}
	if m.applying {
		m.mu.Unlock()
		return errors.New("update already in progress")
	}
	assetURL, checksumURL := m.assetURL, m.checksum
	m.applying = true
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		m.applying = false
		m.mu.Unlock()
	}()
	if assetURL == "" {
		if _, err := m.check(ctx); err != nil {
			return err
		}
		m.mu.Lock()
		assetURL, checksumURL = m.assetURL, m.checksum
		m.mu.Unlock()
	}
	if assetURL == "" {
		return errors.New("no update available")
	}
	if checksumURL == "" {
		return errors.New("release has no checksums.txt")
	}
	expected, err := m.expectedChecksum(ctx, checksumURL, filepath.Base(assetURL))
	if err != nil {
		return m.failApply(err)
	}
	exe, err := os.Executable()
	if err != nil {
		return m.failApply(err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	tmp, err := os.CreateTemp(filepath.Dir(exe), ".sigma-update-*")
	if err != nil {
		return m.failApply(fmt.Errorf("cannot write update next to %s: %w", exe, err))
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	hasher := sha256.New()
	if err := m.download(ctx, assetURL, io.MultiWriter(tmp, hasher)); err != nil {
		tmp.Close()
		return m.failApply(err)
	}
	if err := tmp.Close(); err != nil {
		return m.failApply(err)
	}
	got := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(got, expected) {
		return m.failApply(fmt.Errorf("checksum mismatch: got %s, want %s", got, expected))
	}
	if err := os.Chmod(tmpName, 0o755); err != nil {
		return m.failApply(err)
	}
	old := exe + ".old"
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		return m.failApply(fmt.Errorf("cannot replace running binary: %w", err))
	}
	if err := os.Rename(tmpName, exe); err != nil {
		_ = os.Rename(old, exe)
		return m.failApply(fmt.Errorf("cannot install new binary: %w", err))
	}
	m.mu.Lock()
	m.status.RestartPending = true
	m.status.LastError = ""
	m.downloaded = tmpName
	m.mu.Unlock()
	return nil
}

func (m *Manager) failApply(err error) error {
	m.mu.Lock()
	m.status.LastError = err.Error()
	m.mu.Unlock()
	return err
}

func (m *Manager) download(ctx context.Context, url string, dst io.Writer) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "sigma-updater/"+m.cfg.CurrentVersion)
	if m.cfg.Token != "" && strings.Contains(url, "api.github.com") {
		req.Header.Set("Authorization", "Bearer "+m.cfg.Token)
	}
	res, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned %d", res.StatusCode)
	}
	_, err = io.Copy(dst, io.LimitReader(res.Body, 512<<20))
	return err
}

func (m *Manager) expectedChecksum(ctx context.Context, url, filename string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "sigma-updater/"+m.cfg.CurrentVersion)
	if m.cfg.Token != "" && strings.Contains(url, "api.github.com") {
		req.Header.Set("Authorization", "Bearer "+m.cfg.Token)
	}
	res, err := m.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksums download returned %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && (fields[len(fields)-1] == filename || strings.TrimPrefix(fields[len(fields)-1], "*") == filename) {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("checksum for %s not found", filename)
}
