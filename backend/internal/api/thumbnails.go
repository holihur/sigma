package api

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"sigma/internal/model"
)

const maxThumbnailBytes = 2 << 20

func (a *API) handleGetThumbnail(w http.ResponseWriter, r *http.Request, u model.User) {
	id := r.PathValue("id")
	if a.accessRole(id, u) == "" {
		http.NotFound(w, r)
		return
	}
	f, err := a.st.File(id)
	if err != nil || f.Thumbnail == "" {
		http.NotFound(w, r)
		return
	}
	data, mimeType, err := a.thumbnailBytes(id, f.Thumbnail)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func (a *API) saveThumbnailDataURL(id, raw string) (string, error) {
	data, mimeType, err := decodeImageDataURL(raw)
	if err != nil {
		return "", err
	}
	if len(data) > maxThumbnailBytes {
		return "", errors.New("thumbnail is too large")
	}
	return a.storeThumbnail(id, data, mimeType)
}

func (a *API) storeThumbnail(id string, data []byte, mimeType string) (string, error) {
	ext := thumbnailExt(mimeType)
	if ext == "" {
		return "", errors.New("unsupported thumbnail type")
	}
	dir := filepath.Join(a.uploadDir, "thumbnails")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := thumbnailKey(id) + ext
	dest := filepath.Join(dir, name)
	tmp, err := os.CreateTemp(dir, ".thumb-*")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmpName, dest); err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Join("thumbnails", name)), nil
}

func (a *API) thumbnailBytes(id, raw string) ([]byte, string, error) {
	if strings.HasPrefix(raw, "data:") {
		data, mimeType, err := decodeImageDataURL(raw)
		if err != nil {
			return nil, "", err
		}
		if len(data) > maxThumbnailBytes {
			return nil, "", errors.New("thumbnail is too large")
		}
		// Migrate legacy inline thumbnails on first read. Failure is harmless:
		// the already-decoded image can still be served.
		if stored, err := a.storeThumbnail(id, data, mimeType); err == nil {
			_ = a.st.SetThumbnail(id, stored)
		}
		return data, mimeType, nil
	}
	path, err := thumbnailPath(a.uploadDir, raw)
	if err != nil {
		return nil, "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mimeType == "" {
		mimeType = "image/png"
	}
	return data, mimeType, nil
}

func (a *API) removeThumbnail(raw string) {
	if raw == "" || strings.HasPrefix(raw, "data:") {
		return
	}
	path, err := thumbnailPath(a.uploadDir, raw)
	if err != nil {
		return
	}
	_ = os.Remove(path)
}

func thumbnailPath(uploadDir, raw string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(raw))
	if filepath.IsAbs(clean) || clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid thumbnail path")
	}
	return filepath.Join(uploadDir, clean), nil
}

func thumbnailExt(mimeType string) string {
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ""
	}
}

func thumbnailKey(id string) string {
	sum := sha256.Sum256([]byte(id))
	return hex.EncodeToString(sum[:])
}
