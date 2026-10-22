package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"sigma/internal/auth"
	"sigma/internal/store"
)

func TestAIContextAndSkills(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, _ := st.CreateUser("u_ctx", "Context User", "ctx@example.com", "hash", "#0ea5e9")
	a := New(st, auth.New("secret"), "", t.TempDir(), "secret")

	body := `{"designMd":"# Design system\nUse #0ea5e9.","agentsMd":"Always create a frame."}`
	req := httptest.NewRequest(http.MethodPut, "/api/ai/context", strings.NewReader(body))
	rec := httptest.NewRecorder()
	a.handleSaveAIContext(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("context save %d: %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/ai/context", nil)
	rec = httptest.NewRecorder()
	a.handleAIContext(rec, req, u)
	if !strings.Contains(rec.Body.String(), "#0ea5e9") {
		t.Fatalf("context get: %s", rec.Body.String())
	}

	skillBody := `{"filename":"SKILL.md","content":"---\nname: Checkout QA\ndescription: Review mobile checkout flows\n---\n# Steps\n1. Check the primary action."}`
	req = httptest.NewRequest(http.MethodPost, "/api/ai/skills", strings.NewReader(skillBody))
	rec = httptest.NewRecorder()
	a.handleUploadSkill(rec, req, u)
	if rec.Code != http.StatusCreated {
		t.Fatalf("skill upload %d: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Skill struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"skill"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Skill.Name != "checkout-qa" {
		t.Fatalf("bad skill name: %s", rec.Body.String())
	}

	records, _ := st.ListSkills(u.ID)
	if len(records) != 1 {
		t.Fatalf("expected one skill")
	}
	src := &dbSkillSource{records: records}
	fms, err := src.ListFrontmatters(context.Background())
	if err != nil || len(fms) != 1 || fms[0].Name != "checkout-qa" || fms[0].Description != "Review mobile checkout flows" {
		t.Fatalf("bad source: %#v %v", fms, err)
	}
	instructions, err := src.LoadInstructions(context.Background(), "checkout-qa")
	if err != nil || !strings.Contains(instructions, "Check the primary action") {
		t.Fatalf("bad instructions: %q %v", instructions, err)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/ai/skills/"+created.Skill.ID, nil)
	req.SetPathValue("id", created.Skill.ID)
	rec = httptest.NewRecorder()
	a.handleDeleteSkill(rec, req, u)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete %d: %s", rec.Code, rec.Body.String())
	}
}
