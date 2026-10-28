package api

import (
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"sigma/internal/auth"
	"sigma/internal/model"
	"sigma/internal/static"
	"sigma/internal/store"
	"sigma/internal/update"
	"sigma/internal/ws"

	"google.golang.org/adk/session"
)

type AuthedHandler func(http.ResponseWriter, *http.Request, model.User)

type API struct {
	st          *store.Store
	auth        *auth.Manager
	hub         *ws.Hub
	staticDir   string
	staticFS    fs.FS
	uploadDir   string
	secret      string
	locks       sync.Map
	aiSessions  session.Service
	oidc        *auth.OIDCManager
	updater     *update.Manager
	adminEmails map[string]bool
}

func New(st *store.Store, am *auth.Manager, staticDir, uploadDir, secret string) *API {
	sessionDir := strings.TrimSpace(os.Getenv("AI_SESSION_DIR"))
	if sessionDir == "" {
		sessionDir = filepath.Join(filepath.Dir(uploadDir), "ai-sessions")
	}
	a := &API{st: st, auth: am, staticDir: staticDir, staticFS: static.FS(), uploadDir: uploadDir, secret: secret, aiSessions: newPersistentSessions(sessionDir), oidc: auth.NewOIDCFromEnv(), adminEmails: parseAdminEmails(os.Getenv("SIGMA_ADMIN_EMAILS"))}
	_ = os.MkdirAll(uploadDir, 0o755)
	a.hub = ws.NewHub(
		a.wsAccess,
		func(fileID, userID string, incoming json.RawMessage) (json.RawMessage, int, error) {
			return a.mergeAndSave(fileID, incoming)
		},
		func(fileID, userID string, incoming json.RawMessage) (json.RawMessage, int, error) {
			return a.applyDelta(fileID, incoming)
		},
	)
	return a
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.st.Ping(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "database unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
	})
	mux.HandleFunc("GET /api/templates", a.handleTemplates)
	mux.HandleFunc("GET /api/ai/settings", a.requireAuth(a.handleAISettings))
	mux.HandleFunc("PUT /api/ai/settings", a.requireAuth(a.handleSetAISettings))
	mux.HandleFunc("POST /api/ai/models", a.requireAuth(a.handleListAIModels))
	mux.HandleFunc("POST /api/ai/test", a.requireAuth(a.handleTestAI))
	mux.HandleFunc("POST /api/ai/chat", a.requireAuth(a.handleAIChat))
	mux.HandleFunc("GET /api/ai/context", a.requireAuth(a.handleAIContext))
	mux.HandleFunc("PUT /api/ai/context", a.requireAuth(a.handleSaveAIContext))
	mux.HandleFunc("GET /api/ai/skills", a.requireAuth(a.handleListSkills))
	mux.HandleFunc("POST /api/ai/skills", a.requireAuth(a.handleUploadSkill))
	mux.HandleFunc("DELETE /api/ai/skills/{id}", a.requireAuth(a.handleDeleteSkill))
	mux.HandleFunc("POST /api/mcp", a.requireMCPAuth(a.handleMCP))
	mux.HandleFunc("POST /api/figma/import", a.requireAuth(a.handleFigmaImport))
	mux.HandleFunc("POST /api/figma/import-json", a.requireAuth(a.handleFigmaImportJSON))
	mux.HandleFunc("GET /api/files/{id}/figma-json", a.requireAuth(a.handleFigmaExport))
	mux.HandleFunc("GET /api/tokens", a.requireAuth(a.handleListPATs))
	mux.HandleFunc("POST /api/tokens", a.requireAuth(a.handleCreatePAT))
	mux.HandleFunc("DELETE /api/tokens/{id}", a.requireAuth(a.handleDeletePAT))
	mux.HandleFunc("GET /api/system/update", a.requireAdmin(a.handleUpdateStatus))
	mux.HandleFunc("POST /api/system/update/check", a.requireAdmin(a.handleUpdateCheck))
	mux.HandleFunc("POST /api/system/update/apply", a.requireAdmin(a.handleUpdateApply))

	mux.HandleFunc("POST /api/auth/register", a.handleRegister)
	mux.HandleFunc("POST /api/auth/login", a.handleLogin)
	mux.HandleFunc("GET /api/auth/oidc/config", a.handleOIDCConfig)
	mux.HandleFunc("GET /api/auth/oidc/login", a.handleOIDCLogin)
	mux.HandleFunc("GET /api/auth/oidc/callback", a.handleOIDCCallback)
	mux.HandleFunc("POST /api/auth/oidc/exchange", a.handleOIDCExchange)
	mux.HandleFunc("GET /api/auth/me", a.requireAuth(a.handleMe))
	mux.HandleFunc("PATCH /api/users/me", a.requireAuth(a.handleUpdateMe))

	mux.HandleFunc("GET /api/files", a.requireAuth(a.handleListFiles))
	mux.HandleFunc("POST /api/files", a.requireAuth(a.handleCreateFile))
	mux.HandleFunc("GET /api/files/{id}", a.requireAuth(a.handleGetFile))
	mux.HandleFunc("PATCH /api/files/{id}", a.requireAuth(a.handlePatchFile))
	mux.HandleFunc("DELETE /api/files/{id}", a.requireAuth(a.handleDeleteFile))
	mux.HandleFunc("POST /api/files/{id}/duplicate", a.requireAuth(a.handleDuplicateFile))
	mux.HandleFunc("GET /api/files/{id}/doc", a.requireAuth(a.handleGetDoc))
	mux.HandleFunc("PUT /api/files/{id}/doc", a.requireAuth(a.handlePutDoc))
	mux.HandleFunc("GET /api/files/{id}/versions", a.requireAuth(a.handleListVersions))
	mux.HandleFunc("POST /api/files/{id}/versions", a.requireAuth(a.handleCreateVersion))
	mux.HandleFunc("POST /api/files/{id}/versions/{versionId}/restore", a.requireAuth(a.handleRestoreVersion))
	mux.HandleFunc("POST /api/uploads", a.requireAuth(a.handleUpload))
	mux.HandleFunc("GET /api/uploads/{name}", a.handleUploadFile)
	mux.HandleFunc("GET /api/files/{id}/public-link", a.requireAuth(a.handleGetPublicLink))
	mux.HandleFunc("POST /api/files/{id}/public-link", a.requireAuth(a.handleSetPublicLink))
	mux.HandleFunc("GET /api/public/{token}", a.handlePublicFile)
	mux.HandleFunc("GET /api/notifications", a.requireAuth(a.handleListNotifications))
	mux.HandleFunc("POST /api/notifications/read", a.requireAuth(a.handleReadNotifications))
	mux.HandleFunc("GET /api/files/{id}/comments", a.requireAuth(a.handleListComments))
	mux.HandleFunc("POST /api/files/{id}/comments", a.requireAuth(a.handleCreateComment))
	mux.HandleFunc("PATCH /api/comments/{id}", a.requireAuth(a.handlePatchComment))
	mux.HandleFunc("DELETE /api/comments/{id}", a.requireAuth(a.handleDeleteComment))
	mux.HandleFunc("GET /api/files/{id}/members", a.requireAuth(a.handleListMembers))
	mux.HandleFunc("POST /api/files/{id}/members", a.requireAuth(a.handleAddMember))
	mux.HandleFunc("DELETE /api/files/{id}/members/{userId}", a.requireAuth(a.handleRemoveMember))

	mux.HandleFunc("GET /api/ws", a.hub.Handle)

	if a.staticDir != "" {
		if _, err := os.Stat(path.Join(a.staticDir, "index.html")); err == nil {
			mux.Handle("/", spaHandler(a.staticDir))
		}
	} else if a.staticFS != nil {
		mux.Handle("/", spaFSHandler(a.staticFS))
	}

	return withSecurityHeaders(withCORS(withRateLimit(withLogging(mux))))
}

// ---------- middleware & helpers ----------

func parseAdminEmails(raw string) map[string]bool {
	out := map[string]bool{}
	for _, email := range strings.Split(raw, ",") {
		email = strings.ToLower(strings.TrimSpace(email))
		if email != "" {
			out[email] = true
		}
	}
	return out
}

func (a *API) isAdmin(u model.User) bool {
	return a.adminEmails[strings.ToLower(strings.TrimSpace(u.Email))]
}

// requireAdmin wraps requireAuth with the instance administrator allowlist.
// Update checks and binary replacement are deliberately not available to
// every signed-in user.
func (a *API) requireAdmin(next AuthedHandler) http.HandlerFunc {
	return a.requireAuth(func(w http.ResponseWriter, r *http.Request, u model.User) {
		if !a.isAdmin(u) {
			writeError(w, http.StatusForbidden, "Administrator access required")
			return
		}
		next(w, r, u)
	})
}

func (a *API) requireAuth(next AuthedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		uid, err := a.auth.Parse(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Please sign in again")
			return
		}
		u, err := a.st.UserByID(uid)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Account not found")
			return
		}
		next(w, r, u)
	}
}

func allowedOrigin(origin string) bool {
	allowed := strings.TrimSpace(os.Getenv("APP_ALLOWED_ORIGINS"))
	if allowed == "" || allowed == "*" {
		base := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
		if base != "" {
			if u, err := parseOrigin(base); err == nil && u == origin {
				return true
			}
		}
		// In production without explicit whitelist, only allow same-origin (no Origin header) or base
		return origin == "" || strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1")
	}
	for _, o := range strings.Split(allowed, ",") {
		if strings.TrimSpace(o) == origin {
			return true
		}
	}
	return false
}

func parseOrigin(raw string) (string, error) {
	// crude origin extraction: scheme://host
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		parts := strings.SplitN(raw, "/", 4)
		if len(parts) >= 3 {
			return parts[0] + "//" + parts[2], nil
		}
	}
	return raw, nil
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else if origin != "" {
			// Disallowed origin: do not reflect
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Sigma-Public-Password")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "0")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if r.Header.Get("X-Forwarded-Proto") == "https" || strings.HasPrefix(os.Getenv("APP_BASE_URL"), "https://") {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.figma.com https://api.deepseek.com https://api.openai.com")
		next.ServeHTTP(w, r)
	})
}

var rateLimitStore sync.Map // ip -> *rateBucket
type rateBucket struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time
}

func withRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only rate-limit auth & write endpoints
		if !(strings.HasPrefix(r.URL.Path, "/api/auth/") || strings.HasPrefix(r.URL.Path, "/api/figma/")) {
			next.ServeHTTP(w, r)
			return
		}
		ip := r.RemoteAddr
		if idx := strings.LastIndex(ip, ":"); idx != -1 {
			ip = ip[:idx]
		}
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			ip = strings.TrimSpace(strings.Split(fwd, ",")[0])
		}
		v, _ := rateLimitStore.LoadOrStore(ip, &rateBucket{tokens: 5, last: time.Now()})
		b := v.(*rateBucket)
		b.mu.Lock()
		now := time.Now()
		elapsed := now.Sub(b.last).Seconds()
		b.tokens += elapsed * (5.0 / 60.0) // 5 req per minute refill
		if b.tokens > 10 {
			b.tokens = 10
		}
		b.last = now
		if b.tokens < 1 {
			b.mu.Unlock()
			w.Header().Set("Retry-After", "60")
			writeError(w, http.StatusTooManyRequests, "Too many requests, please try again later")
			return
		}
		b.tokens--
		b.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/ws") {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		if rec.status >= 400 {
			log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Millisecond))
		}
	})
}

func spaHandler(dir string) http.Handler {
	return spaFSHandler(os.DirFS(dir))
}

var gzipPool = sync.Pool{New: func() any { return gzip.NewWriter(nil) }}

func spaFSHandler(root fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(root))
	serve := func(w http.ResponseWriter, r *http.Request, p string, next http.Handler) {
		w.Header().Add("Vary", "Accept-Encoding")
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		if r.Method != http.MethodHead && acceptsGzip(r) && gzipEligible(p) {
			w.Header().Set("Content-Encoding", "gzip")
			gw := gzipPool.Get().(*gzip.Writer)
			gw.Reset(w)
			defer func() { gw.Close(); gzipPool.Put(gw) }()
			next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, gzip: gw}, r)
			return
		}
		next.ServeHTTP(w, r)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" {
			if f, err := root.Open(p); err == nil {
				_ = f.Close()
				serve(w, r, p, fileServer)
				return
			}
		}
		if strings.HasPrefix(p, "assets/") || strings.HasPrefix(p, "brand/") {
			http.NotFound(w, r)
			return
		}
		index, err := fs.ReadFile(root, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		serve(w, r, "index.html", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(index)
		}))
	})
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.EqualFold(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]), "gzip") {
			return true
		}
	}
	return false
}

func gzipEligible(p string) bool {
	switch strings.ToLower(path.Ext(p)) {
	case ".html", ".js", ".mjs", ".css", ".svg", ".json", ".txt", ".xml", ".map":
		return true
	default:
		return false
	}
}

type gzipResponseWriter struct {
	http.ResponseWriter
	gzip *gzip.Writer
}

func (w *gzipResponseWriter) WriteHeader(status int) {
	w.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(status)
}

func (w *gzipResponseWriter) Write(p []byte) (int, error) {
	w.Header().Del("Content-Length")
	return w.gzip.Write(p)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("encode response: %v", err)
		}
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	// General limit 8MB; Figma import handlers use their own 96MB limit
	dec := json.NewDecoder(io.LimitReader(r.Body, 8<<20))
	if err := dec.Decode(dst); err != nil {
		return err
	}
	// Defend against trailing garbage after valid JSON
	if dec.More() {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func newID(prefix string) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return prefix + "_" + hex.EncodeToString([]byte(time.Now().String()))[:16]
	}
	return prefix + "_" + hex.EncodeToString(b)
}

func newToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(b)
}

func (a *API) fileLock(id string) *sync.Mutex {
	v, _ := a.locks.LoadOrStore(id, &sync.Mutex{})
	return v.(*sync.Mutex)
}
