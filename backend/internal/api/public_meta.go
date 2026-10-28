package api

import (
	"encoding/base64"
	"errors"
	"fmt"
	stdhtml "html"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (a *API) handlePublicPrototypeHTML(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	f, passwordHash, err := a.st.FileByPublicToken(token)
	if err != nil || passwordHash != "" {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		a.writeIndexHTML(w, r, `<meta name="robots" content="noindex, nofollow">`, "Protected prototype — Sigma")
		return
	}

	owner, _ := a.st.UserByID(f.OwnerID)
	ownerName := strings.TrimSpace(owner.Name)
	if ownerName == "" {
		ownerName = "a Sigma creator"
	}
	name := strings.TrimSpace(f.Name)
	if name == "" {
		name = "Untitled prototype"
	}
	base := publicBaseURL(r)
	pageURL := base + "/p/" + url.PathEscape(token)
	title := name + " — Sigma prototype"
	description := "Interactive prototype by " + ownerName + " — built with Sigma."
	image := base + "/og-default.png"
	if f.Thumbnail != "" {
		image = base + "/api/public/" + url.PathEscape(token) + "/thumbnail"
	}
	a.writeIndexHTML(w, r, publicMetaTags(pageURL, title, description, image), title)
}

func (a *API) handlePublicThumbnail(w http.ResponseWriter, r *http.Request) {
	f, passwordHash, err := a.st.FileByPublicToken(r.PathValue("token"))
	if err != nil || passwordHash != "" || f.Thumbnail == "" {
		http.NotFound(w, r)
		return
	}
	data, mime, err := decodeImageDataURL(f.Thumbnail)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func (a *API) writeIndexHTML(w http.ResponseWriter, r *http.Request, head, title string) {
	index, err := a.readIndexHTML()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	page := string(index)
	if start := strings.Index(page, "<title>"); start >= 0 {
		if end := strings.Index(page[start:], "</title>"); end >= 0 {
			end += start + len("</title>")
			page = page[:start] + "<title>" + stdhtml.EscapeString(title) + "</title>" + page[end:]
		}
	}
	if head != "" {
		page = strings.Replace(page, "</head>", head+"\n</head>", 1)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = io.WriteString(w, page)
}

func (a *API) readIndexHTML() ([]byte, error) {
	if a.staticDir != "" {
		if data, err := os.ReadFile(filepath.Join(a.staticDir, "index.html")); err == nil {
			return data, nil
		}
	}
	if a.staticFS != nil {
		return fs.ReadFile(a.staticFS, "index.html")
	}
	return nil, fs.ErrNotExist
}

func publicBaseURL(r *http.Request) string {
	if base := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_BASE_URL")), "/"); base != "" {
		return base
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost"
	}
	return scheme + "://" + host
}

func publicMetaTags(pageURL, title, description, image string) string {
	esc := stdhtml.EscapeString
	return fmt.Sprintf(`<link rel="canonical" href="%s">
<meta name="description" content="%s">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sigma">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
<meta property="og:url" content="%s">
<meta property="og:image" content="%s">
<meta property="og:image:alt" content="%s">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%s">
<meta name="twitter:description" content="%s">
<meta name="twitter:image" content="%s">`,
		esc(pageURL), esc(description), esc(title), esc(description), esc(pageURL), esc(image), esc(title), esc(title), esc(description), esc(image))
}

func decodeImageDataURL(raw string) ([]byte, string, error) {
	if !strings.HasPrefix(raw, "data:") {
		return nil, "", errors.New("thumbnail is not a data URL")
	}
	comma := strings.IndexByte(raw, ',')
	if comma < 0 {
		return nil, "", errors.New("malformed data URL")
	}
	meta := raw[5:comma]
	parts := strings.Split(meta, ";")
	if len(parts) < 2 || parts[len(parts)-1] != "base64" {
		return nil, "", errors.New("thumbnail is not base64 encoded")
	}
	mime := parts[0]
	switch mime {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
	default:
		return nil, "", errors.New("unsupported thumbnail type")
	}
	data, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return nil, "", err
	}
	return data, mime, nil
}
