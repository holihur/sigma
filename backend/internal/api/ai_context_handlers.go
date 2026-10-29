package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"google.golang.org/adk/tool/skilltoolset/skill"

	"sigma/internal/model"
	"sigma/internal/store"
)

const (
	maxAgentDocBytes = 128 << 10
	maxSkillBytes    = 512 << 10
)

var skillNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)

func cleanSkillName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (a *API) handleAIContext(w http.ResponseWriter, r *http.Request, u model.User) {
	c, err := a.st.AIContext(u.ID)
	if err != nil && !store.ErrNotFound(err) {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"designMd": c.DesignMD, "agentsMd": c.AgentsMD, "updatedAt": c.UpdatedAt})
}

func (a *API) handleSaveAIContext(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		DesignMD string `json:"designMd"`
		AgentsMD string `json:"agentsMd"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(body.DesignMD) > maxAgentDocBytes || len(body.AgentsMD) > maxAgentDocBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "Design.md and AGENTS.md must each be under 128 KB")
		return
	}
	if err := a.st.SaveAIContext(u.ID, body.DesignMD, body.AgentsMD); err != nil {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func skillView(r store.SkillRecord) map[string]any {
	return map[string]any{
		"id": r.ID, "name": r.Name, "description": r.Description,
		"createdAt": r.CreatedAt, "updatedAt": r.UpdatedAt,
	}
}

func (a *API) handleListSkills(w http.ResponseWriter, r *http.Request, u model.User) {
	list, err := a.st.ListSkills(u.ID)
	if err != nil {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, rec := range list {
		out = append(out, skillView(rec))
	}
	writeJSON(w, http.StatusOK, map[string]any{"skills": out})
}

func (a *API) handleUploadSkill(w http.ResponseWriter, r *http.Request, u model.User) {
	var body struct {
		Filename string `json:"filename"`
		Content  string `json:"content"`
	}
	if err := readJSONLimit(r, &body, maxSkillBytes+(64<<10)); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "SKILL.md must be under 512 KB")
		return
	}
	if len(body.Content) > maxSkillBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "SKILL.md must be under 512 KB")
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		writeError(w, http.StatusBadRequest, "SKILL.md is empty")
		return
	}
	name := ""
	description := ""
	content := body.Content
	// Agent Skills requires lowercase hyphenated names. Normalize a friendly
	// display name (for example "Checkout QA") before validation.
	if strings.HasPrefix(strings.TrimSpace(content), "---") {
		nameLine := regexp.MustCompile(`(?m)^name:\s*(.+)$`)
		content = nameLine.ReplaceAllStringFunc(content, func(line string) string {
			value := strings.Trim(strings.TrimSpace(strings.TrimPrefix(line, "name:")), `"'`)
			slug := cleanSkillName(value)
			if slug == "" {
				return line
			}
			return "name: " + slug
		})
	}
	// Parse the Agent Skills frontmatter when present. Plain markdown is still
	// accepted for teams that keep lightweight internal instructions.
	if fm, markdown, err := skill.ParseBytes([]byte(content)); err == nil && fm != nil {
		name = cleanSkillName(fm.Name)
		description = strings.TrimSpace(fm.Description)
		if markdown == "" && fm.Name == "" {
			// parse succeeded but this was not a frontmatter document
			name = ""
		}
	} else if err != nil && strings.HasPrefix(strings.TrimSpace(content), "---") {
		writeError(w, http.StatusBadRequest, "Invalid SKILL.md frontmatter: "+err.Error())
		return
	}
	if name == "" {
		base := strings.TrimSuffix(strings.TrimSuffix(body.Filename, ".md"), ".MD")
		base = strings.TrimSuffix(base, "SKILL")
		name = cleanSkillName(base)
	}
	if name == "" {
		name = cleanSkillName(fmt.Sprintf("skill-%d", len(body.Content)))
	}
	if !skillNameRe.MatchString(name) {
		name = "skill-" + name
	}
	if !skillNameRe.MatchString(name) {
		writeError(w, http.StatusBadRequest, "Could not derive a valid skill name")
		return
	}
	if description == "" {
		for _, line := range strings.Split(body.Content, "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "---") && !strings.HasPrefix(line, "#") {
				description = line
				break
			}
		}
	}
	if description == "" {
		description = "Custom Sigma design skill"
	}
	if len([]rune(description)) > 240 {
		description = string([]rune(description)[:240])
	}
	rec := store.SkillRecord{
		ID: newID("skill"), UserID: u.ID, Name: name, Description: description, Content: content,
	}
	out, err := a.st.UpsertSkill(rec)
	if err != nil {
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"skill": skillView(out)})
}

func (a *API) handleDeleteSkill(w http.ResponseWriter, r *http.Request, u model.User) {
	if err := a.st.DeleteSkill(r.PathValue("id"), u.ID); err != nil {
		if store.ErrNotFound(err) {
			writeError(w, http.StatusNotFound, "Skill not found")
			return
		}
		writeServerError(w, http.StatusInternalServerError, err, "Internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// dbSkillSource adapts uploaded SKILL.md records to ADK's skill source.
type dbSkillSource struct {
	records []store.SkillRecord
}

func (s *dbSkillSource) find(name string) (store.SkillRecord, bool) {
	for _, rec := range s.records {
		if rec.Name == name {
			return rec, true
		}
	}
	return store.SkillRecord{}, false
}

func (s *dbSkillSource) parse(rec store.SkillRecord) (*skill.Frontmatter, string) {
	if fm, body, err := skill.ParseBytes([]byte(rec.Content)); err == nil && fm != nil && fm.Name != "" {
		return fm, body
	}
	return &skill.Frontmatter{Name: rec.Name, Description: rec.Description}, rec.Content
}

func (s *dbSkillSource) ListFrontmatters(_ context.Context) ([]*skill.Frontmatter, error) {
	out := make([]*skill.Frontmatter, 0, len(s.records))
	for _, rec := range s.records {
		fm, _ := s.parse(rec)
		out = append(out, fm)
	}
	return out, nil
}

func (s *dbSkillSource) ListResources(_ context.Context, _, _ string) ([]string, error) {
	return []string{}, nil
}

func (s *dbSkillSource) LoadFrontmatter(_ context.Context, name string) (*skill.Frontmatter, error) {
	rec, ok := s.find(name)
	if !ok {
		return nil, skill.ErrSkillNotFound
	}
	fm, _ := s.parse(rec)
	return fm, nil
}

func (s *dbSkillSource) LoadInstructions(_ context.Context, name string) (string, error) {
	rec, ok := s.find(name)
	if !ok {
		return "", skill.ErrSkillNotFound
	}
	_, body := s.parse(rec)
	return body, nil
}

func (s *dbSkillSource) LoadResource(_ context.Context, name, resourcePath string) (io.ReadCloser, error) {
	if _, ok := s.find(name); !ok {
		return nil, skill.ErrSkillNotFound
	}
	return nil, fmt.Errorf("%w: %q", skill.ErrResourceNotFound, resourcePath)
}
