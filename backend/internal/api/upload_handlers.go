package api

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"sigma/internal/model"
)

const maxUploadSize = 10 << 20

var allowedImageTypes = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

func (a *API) handleUpload(w http.ResponseWriter, r *http.Request, u model.User) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1<<20)
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Please choose an image to upload")
		return
	}
	defer file.Close()
	if header.Size > maxUploadSize {
		writeError(w, http.StatusRequestEntityTooLarge, "Images must be smaller than 10 MB")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUploadSize+1))
	if err != nil || len(data) > maxUploadSize {
		writeError(w, http.StatusRequestEntityTooLarge, "Images must be smaller than 10 MB")
		return
	}
	contentType := http.DetectContentType(data)
	ext, ok := allowedImageTypes[contentType]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "Only PNG, JPG, GIF and WebP images are supported")
		return
	}
	name := newID("img") + ext
	if err := os.MkdirAll(a.uploadDir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not store image")
		return
	}
	if err := os.WriteFile(filepath.Join(a.uploadDir, name), data, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not store image")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"url":  "/api/uploads/" + name,
		"size": len(data),
		"type": contentType,
	})
}

func (a *API) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if filepath.Base(name) != name || strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
	default:
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.uploadDir, name)
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, path)
}
