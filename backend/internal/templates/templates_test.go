package templates

import (
	"encoding/json"
	"testing"
)

func TestEmbeddedTemplatesAreValid(t *testing.T) {
	list := List()
	if len(list) < 4 {
		t.Fatalf("expected at least 4 templates, got %d", len(list))
	}
	for _, meta := range list {
		raw, ok := Load(meta.ID)
		if !ok {
			t.Fatalf("template %q could not be loaded", meta.ID)
		}
		var doc struct {
			Pages []struct {
				ID    string          `json:"id"`
				Nodes json.RawMessage `json:"nodes"`
			} `json:"pages"`
		}
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatalf("template %q is not valid json: %v", meta.ID, err)
		}
		if len(doc.Pages) == 0 {
			t.Fatalf("template %q has no pages", meta.ID)
		}
	}
}

func TestBlankTemplateFallback(t *testing.T) {
	raw, ok := Load("blank")
	if !ok || len(raw) == 0 {
		t.Fatal("blank template should always load")
	}
	if _, ok := Load("does-not-exist"); ok {
		t.Fatal("unknown template should not load")
	}
}
