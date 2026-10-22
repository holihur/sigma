package templates

import (
	"embed"
	"encoding/json"
	"path"
	"sort"
)

//go:embed *.json
var fs embed.FS

type Meta struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Accent      string `json:"accent"`
	Icon        string `json:"icon"`
}

// Load returns the raw document JSON for a template id.
func Load(id string) ([]byte, bool) {
	if id == "" || id == "blank" {
		return []byte(`{"pages":[{"id":"page-blank","name":"Page 1","nodes":{},"rootIds":[],"ts":0}],"tombstones":{}}`), true
	}
	for _, m := range List() {
		if m.ID != id {
			continue
		}
		b, err := fs.ReadFile(id + ".json")
		if err != nil {
			return nil, false
		}
		var payload struct {
			Doc json.RawMessage `json:"doc"`
		}
		if err := json.Unmarshal(b, &payload); err != nil || len(payload.Doc) == 0 {
			return nil, false
		}
		return payload.Doc, true
	}
	return nil, false
}

func List() []Meta {
	entries, err := fs.ReadDir(".")
	if err != nil {
		return []Meta{}
	}
	out := []Meta{}
	for _, e := range entries {
		if e.IsDir() || path.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := fs.ReadFile(e.Name())
		if err != nil {
			continue
		}
		var payload struct {
			Meta Meta `json:"meta"`
		}
		if err := json.Unmarshal(b, &payload); err != nil {
			continue
		}
		if payload.Meta.ID != "" {
			out = append(out, payload.Meta)
		}
	}
	order := map[string]int{"blank": 0, "mobile": 1, "website": 2, "dashboard": 3, "material": 4, "ios": 5, "fluent": 6, "carbon": 7}
	sort.SliceStable(out, func(i, j int) bool {
		oi, okI := order[out[i].ID]
		oj, okJ := order[out[j].ID]
		if okI && okJ {
			return oi < oj
		}
		if okI != okJ {
			return okI
		}
		return out[i].Name < out[j].Name
	})
	return out
}
