// Package static exposes the frontend bundle embedded into release builds.
// Development builds leave it nil and serve STATIC_DIR / frontend/dist instead.
package static

import "io/fs"

var embedded fs.FS

func Set(f fs.FS) { embedded = f }

func FS() fs.FS { return embedded }
