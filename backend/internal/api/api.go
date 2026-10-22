package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"sigma/internal/auth"
	"sigma/internal/model"
	"sigma/internal/store"
	"sigma/internal/ws"

	"google.golang.org/adk/session"
)

type AuthedHandler func(http.ResponseWriter, *http.Request, model.User)

type API struct {
	st        *store.Store
	auth      *auth.Manager
	hub       *ws.Hub
	staticDir string
	uploadDir string
	secret    string
	locks     sync.Map
	aiSessions session.Service
}

func New(st *store.Store, am *auth.Manager, staticDir, uploadDir, secret string) *API {
	a := &API{st: st, auth: am, staticDir: staticDir, uploadDir: uploadDir, secret: secret, aiSessions: session.InMemoryService()}
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
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
	})
	mux.HandleFunc("GET /api/templates", a.handleTemplates)
	mux.HandleFunc("GET /api/ai/settings", a.requireAuth(a.handleAISettings))
	mux.HandleFunc("PUT /api/ai/settings", a.requireAuth(a.handleSetAISettings))
	mux.HandleFunc("POST /api/ai/test", a.requireAuth(a.handleTestAI))
	mux.HandleFunc("POST /api/ai/chat", a.requireAuth(a.handleAIChat))

	mux.HandleFunc("POST /api/auth/register", a.handleRegister)
	mux.HandleFunc("POST /api/auth/login", a.handleLogin)
	mux.HandleFunc("GET /api/auth/me", a.requireAuth(a.handleMe))

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
	}

	return withCORS(withLogging(mux))
}

// ---------- middleware & helpers ----------

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

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
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
	fs := http.Dir(dir)
	fileServer := http.FileServer(fs)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean(r.URL.Path)
		if p != "/" {
			if f, err := fs.Open(p); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, path.Join(dir, "index.html"))
	})
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
	dec := json.NewDecoder(io.LimitReader(r.Body, 64<<20))
	return dec.Decode(dst)
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
