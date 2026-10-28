package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"sigma/internal/api"
	"sigma/internal/auth"
	"sigma/internal/store"
	"sigma/internal/templates"
	"sigma/internal/update"
)

var (
	version = "dev"
	commit  = ""
	date    = ""
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	dbPath := env("DB_PATH", filepath.Join("data", "sigma.db"))
	port := env("PORT", "9000")
	secret := strings.TrimSpace(os.Getenv("SIGMA_SECRET"))
	if secret == "" {
		if env("GO_ENV", "") == "development" || env("SIGMA_ALLOW_INSECURE_SECRET", "") == "1" {
			log.Println("WARNING: SIGMA_SECRET not set, using insecure development secret")
			secret = "sigma-dev-secret-change-in-production"
		} else {
			log.Fatalf("SIGMA_SECRET is required (generate with: openssl rand -hex 32)")
		}
	}
	if secret == "sigma-dev-secret-change-in-production" || secret == "change-me-in-production" {
		log.Println("WARNING: running with default SIGMA_SECRET — do not use in production")
	}

	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer st.Close()

	am := auth.New(secret)
	if err := seedDemo(st, am); err != nil {
		log.Printf("seed demo: %v", err)
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		for _, candidate := range []string{filepath.Join("..", "frontend", "dist"), filepath.Join("frontend", "dist")} {
			if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
				staticDir, _ = filepath.Abs(candidate)
				break
			}
		}
	}

	uploadDir := env("UPLOAD_DIR", filepath.Join(filepath.Dir(dbPath), "uploads"))
	a := api.New(st, am, staticDir, uploadDir, secret)
	updater := update.NewFromEnv(version)
	a.SetUpdater(updater)
	go updater.Start(context.Background())
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           a.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		static := staticDir
		source := "disk"
		if static == "" {
			static = "embedded"
			source = "embed"
		}
		log.Printf("Sigma %s (%s) listening on http://localhost:%s (static: %s [%s], uploads: %q)", version, commit, port, static, source, uploadDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")
	_ = srv.Close()
}

func seedDemo(st *store.Store, am *auth.Manager) error {
	_, _, err := st.UserByEmail("demo@sigma.design")
	if err == nil {
		return nil
	}
	if !store.ErrNotFound(err) {
		return err
	}
	hash, err := am.HashPassword("demo1234")
	if err != nil {
		return err
	}
	u, err := st.CreateUser("u_demo", "Sigma Demo", "demo@sigma.design", hash, "#0ea5e9")
	if err != nil {
		return err
	}
	seeds := []struct {
		name    string
		tmpl    string
		starred bool
	}{
		{"Ant Design — Console", "ant", true},
		{"Material 3 — Home", "material", false},
	}
	for i, s := range seeds {
		docJSON, ok := templates.Load(s.tmpl)
		if !ok {
			log.Printf("template %q not found, skipping demo seed %q", s.tmpl, s.name)
			continue
		}
		id := "f_demo_" + s.tmpl
		if _, err := st.CreateFile(id, s.name, u.ID, string(docJSON), s.tmpl); err != nil {
			return err
		}
		if s.starred {
			_ = st.SetStar(id, u.ID, true)
		}
		_ = i
	}
	return nil
}
