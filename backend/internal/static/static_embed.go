//go:build embed_static

package static

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var files embed.FS

func init() {
	if sub, err := fs.Sub(files, "dist"); err == nil {
		Set(sub)
	}
}
