package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"sigma/internal/api"
	"sigma/internal/auth"
	"sigma/internal/store"
	"sigma/internal/templates"
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
	secret := env("SIGMA_SECRET", "sigma-dev-secret-change-in-production")

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
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           a.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("Sigma backend listening on http://localhost:%s (static: %q, uploads: %q)", port, staticDir, uploadDir)
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
	u, err := st.CreateUser("u_demo", "Demo Designer", "demo@sigma.design", hash, "#7c5cff")
	if err != nil {
		return err
	}
	seeds := []struct {
		name    string
		tmpl    string
		starred bool
	}{
		{"Mobile App · Onboarding", "mobile", true},
		{"Northwind — Landing Page", "website", false},
		{"Analytics Dashboard", "dashboard", true},
	}
	for i, s := range seeds {
		docJSON, ok := templates.Load(s.tmpl)
		if !ok {
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
