package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"

	"sigma/internal/model"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(10000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Ping() error {
	var one int
	return s.db.QueryRow(`SELECT 1`).Scan(&one)
}

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
	id         TEXT PRIMARY KEY,
	name       TEXT NOT NULL,
	email      TEXT NOT NULL UNIQUE,
	password   TEXT NOT NULL,
	color      TEXT NOT NULL,
	avatar     TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
	id         TEXT PRIMARY KEY,
	name       TEXT NOT NULL,
	owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	doc        TEXT NOT NULL DEFAULT '{"pages":[]}',
	version    INTEGER NOT NULL DEFAULT 1,
	thumbnail  TEXT NOT NULL DEFAULT '',
	template   TEXT NOT NULL DEFAULT 'blank',
	folder     TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_members (
	file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role       TEXT NOT NULL DEFAULT 'edit',
	created_at TEXT NOT NULL,
	PRIMARY KEY (file_id, user_id)
);
CREATE TABLE IF NOT EXISTS file_stars (
	file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	PRIMARY KEY (file_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
	id         TEXT PRIMARY KEY,
	file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	page_id    TEXT NOT NULL,
	node_id    TEXT NOT NULL DEFAULT '',
	parent_id  TEXT NOT NULL DEFAULT '',
	x          REAL NOT NULL DEFAULT 0,
	y          REAL NOT NULL DEFAULT 0,
	text       TEXT NOT NULL,
	author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	resolved   INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
	id         TEXT PRIMARY KEY,
	file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	doc        TEXT NOT NULL,
	version    INTEGER NOT NULL,
	author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public_links (
	file_id    TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
	token      TEXT NOT NULL UNIQUE,
	enabled    INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_settings (
	user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	provider     TEXT NOT NULL DEFAULT 'deepseek',
	base_url     TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
	model        TEXT NOT NULL DEFAULT 'deepseek-v4.1-flash',
	api_key_enc  TEXT NOT NULL DEFAULT '',
	updated_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_identities (
	issuer     TEXT NOT NULL,
	subject    TEXT NOT NULL,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	email      TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	PRIMARY KEY (issuer, subject)
);
CREATE TABLE IF NOT EXISTS personal_access_tokens (
	id           TEXT PRIMARY KEY,
	user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name         TEXT NOT NULL,
	prefix       TEXT NOT NULL,
	token_hash   TEXT NOT NULL UNIQUE,
	scopes       TEXT NOT NULL DEFAULT 'mcp:read mcp:write',
	last_used_at TEXT NOT NULL DEFAULT '',
	expires_at   TEXT NOT NULL DEFAULT '',
	created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_context (
	user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	design_md  TEXT NOT NULL DEFAULT '',
	agents_md  TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_skills (
	id           TEXT PRIMARY KEY,
	user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name         TEXT NOT NULL,
	description  TEXT NOT NULL DEFAULT '',
	content      TEXT NOT NULL,
	created_at   TEXT NOT NULL,
	updated_at   TEXT NOT NULL,
	UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS notifications (
	id         TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	comment_id TEXT NOT NULL DEFAULT '',
	actor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       TEXT NOT NULL DEFAULT 'comment',
	text       TEXT NOT NULL DEFAULT '',
	read       INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON file_members(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_versions_file ON versions(file_id);
CREATE INDEX IF NOT EXISTS idx_pat_user ON personal_access_tokens(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_identity_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_skills_user ON ai_skills(user_id, updated_at);
CREATE TABLE IF NOT EXISTS audit_logs (
	id         TEXT PRIMARY KEY,
	file_id    TEXT NOT NULL,
	actor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	action     TEXT NOT NULL,
	meta       TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_file ON audit_logs(file_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}
	// Existing installations predate profile avatars and dashboard folders.
	for _, stmt := range []string{
		`ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE files ADD COLUMN folder TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE comments ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := s.db.Exec(stmt); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return err
		}
	}
	return nil
}

// ---------- users ----------

func (s *Store) CreateUser(id, name, email, passwordHash, color string) (model.User, error) {
	now := model.Now()
	email = strings.ToLower(strings.TrimSpace(email))
	_, err := s.db.Exec(`INSERT INTO users(id,name,email,password,color,created_at) VALUES(?,?,?,?,?,?)`,
		id, name, email, passwordHash, color, now)
	if err != nil {
		return model.User{}, err
	}
	return model.User{ID: id, Name: name, Email: email, Color: color, CreatedAt: now}, nil
}

func (s *Store) UserByEmail(email string) (model.User, string, error) {
	var u model.User
	var hash string
	err := s.db.QueryRow(`SELECT id,name,email,color,avatar,created_at,password FROM users WHERE email=?`,
		strings.ToLower(strings.TrimSpace(email))).Scan(&u.ID, &u.Name, &u.Email, &u.Color, &u.Avatar, &u.CreatedAt, &hash)
	return u, hash, err
}

func (s *Store) UserByID(id string) (model.User, error) {
	var u model.User
	err := s.db.QueryRow(`SELECT id,name,email,color,avatar,created_at FROM users WHERE id=?`, id).
		Scan(&u.ID, &u.Name, &u.Email, &u.Color, &u.Avatar, &u.CreatedAt)
	return u, err
}

func (s *Store) UpdateUserProfile(id, name, color, avatar string) (model.User, error) {
	_, err := s.db.Exec(`UPDATE users SET name=?, color=?, avatar=? WHERE id=?`, name, color, avatar, id)
	if err != nil {
		return model.User{}, err
	}
	return s.UserByID(id)
}

// ---------- SSO identities ----------

func (s *Store) UserByIdentity(issuer, subject string) (model.User, error) {
	var u model.User
	err := s.db.QueryRow(`SELECT u.id,u.name,u.email,u.color,u.avatar,u.created_at
		FROM user_identities i JOIN users u ON u.id=i.user_id
		WHERE i.issuer=? AND i.subject=?`, issuer, subject).
		Scan(&u.ID, &u.Name, &u.Email, &u.Color, &u.Avatar, &u.CreatedAt)
	return u, err
}

func (s *Store) LinkIdentity(issuer, subject, userID, email string) error {
	_, err := s.db.Exec(`INSERT INTO user_identities(issuer,subject,user_id,email,created_at)
		VALUES(?,?,?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET email=excluded.email`,
		issuer, subject, userID, strings.ToLower(email), model.Now())
	return err
}

// ---------- files ----------

func (s *Store) CreateFile(id, name, ownerID, doc, template string) (model.FileMeta, error) {
	now := model.Now()
	_, err := s.db.Exec(`INSERT INTO files(id,name,owner_id,doc,version,thumbnail,template,folder,created_at,updated_at)
		VALUES(?,?,?,?,1,'',?,'',?,?)`, id, name, ownerID, doc, template, now, now)
	if err != nil {
		return model.FileMeta{}, err
	}
	return s.FileMeta(id, ownerID)
}

func (s *Store) File(id string) (model.File, error) {
	var f model.File
	err := s.db.QueryRow(`SELECT id,name,owner_id,doc,version,thumbnail,template,folder,created_at,updated_at FROM files WHERE id=?`, id).
		Scan(&f.ID, &f.Name, &f.OwnerID, &f.Doc, &f.Version, &f.Thumbnail, &f.Template, &f.Folder, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (s *Store) FileMeta(id, userID string) (model.FileMeta, error) {
	var m model.FileMeta
	err := s.db.QueryRow(`SELECT f.id,f.name,f.owner_id,u.name,f.version,f.thumbnail,f.template,f.folder,f.created_at,f.updated_at,
		CASE WHEN f.owner_id=? THEN 'owner' ELSE COALESCE(m.role,'') END,
		EXISTS(SELECT 1 FROM file_stars st WHERE st.file_id=f.id AND st.user_id=?)
		FROM files f JOIN users u ON u.id=f.owner_id
		LEFT JOIN file_members m ON m.file_id=f.id AND m.user_id=?
		WHERE f.id=?`, userID, userID, userID, id).
		Scan(&m.ID, &m.Name, &m.OwnerID, &m.OwnerName, &m.Version, &m.Thumbnail, &m.Template, &m.Folder,
			&m.CreatedAt, &m.UpdatedAt, &m.Role, &m.Starred)
	return m, err
}

func (s *Store) ListFiles(userID string) ([]model.FileMeta, error) {
	rows, err := s.db.Query(`SELECT f.id,f.name,f.owner_id,u.name,f.version,f.thumbnail,f.template,f.folder,f.created_at,f.updated_at,
		CASE WHEN f.owner_id=? THEN 'owner' ELSE COALESCE(m.role,'') END,
		EXISTS(SELECT 1 FROM file_stars st WHERE st.file_id=f.id AND st.user_id=?)
		FROM files f JOIN users u ON u.id=f.owner_id
		LEFT JOIN file_members m ON m.file_id=f.id AND m.user_id=?
		WHERE f.owner_id=? OR m.user_id IS NOT NULL
		ORDER BY f.updated_at DESC`, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.FileMeta{}
	for rows.Next() {
		var m model.FileMeta
		if err := rows.Scan(&m.ID, &m.Name, &m.OwnerID, &m.OwnerName, &m.Version, &m.Thumbnail, &m.Template, &m.Folder,
			&m.CreatedAt, &m.UpdatedAt, &m.Role, &m.Starred); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) SetFolder(id, folder string) error {
	_, err := s.db.Exec(`UPDATE files SET folder=?, updated_at=? WHERE id=?`, folder, model.Now(), id)
	return err
}

func (s *Store) RenameFile(id, name string) error {
	_, err := s.db.Exec(`UPDATE files SET name=?, updated_at=? WHERE id=?`, name, model.Now(), id)
	return err
}

func (s *Store) SetThumbnail(id, thumb string) error {
	_, err := s.db.Exec(`UPDATE files SET thumbnail=? WHERE id=?`, thumb, id)
	return err
}

func (s *Store) SaveDoc(id, doc string, version int) error {
	_, err := s.db.Exec(`UPDATE files SET doc=?, version=?, updated_at=? WHERE id=?`, doc, version, model.Now(), id)
	return err
}

func (s *Store) DeleteFile(id string) error {
	_, err := s.db.Exec(`DELETE FROM files WHERE id=?`, id)
	return err
}

func (s *Store) SetStar(fileID, userID string, starred bool) error {
	if starred {
		_, err := s.db.Exec(`INSERT OR IGNORE INTO file_stars(file_id,user_id) VALUES(?,?)`, fileID, userID)
		return err
	}
	_, err := s.db.Exec(`DELETE FROM file_stars WHERE file_id=? AND user_id=?`, fileID, userID)
	return err
}

// RoleFor returns "owner", "edit", "view" or "".
func (s *Store) RoleFor(fileID, userID string) string {
	var owner string
	if err := s.db.QueryRow(`SELECT owner_id FROM files WHERE id=?`, fileID).Scan(&owner); err != nil {
		return ""
	}
	if owner == userID {
		return "owner"
	}
	var role string
	err := s.db.QueryRow(`SELECT role FROM file_members WHERE file_id=? AND user_id=?`, fileID, userID).Scan(&role)
	if err != nil {
		return ""
	}
	return role
}

// ---------- members ----------

func (s *Store) AddMember(fileID, userID, role string) error {
	if role != "edit" && role != "view" {
		role = "edit"
	}
	_, err := s.db.Exec(`INSERT INTO file_members(file_id,user_id,role,created_at) VALUES(?,?,?,?)
		ON CONFLICT(file_id,user_id) DO UPDATE SET role=excluded.role`, fileID, userID, role, model.Now())
	return err
}

func (s *Store) RemoveMember(fileID, userID string) error {
	_, err := s.db.Exec(`DELETE FROM file_members WHERE file_id=? AND user_id=?`, fileID, userID)
	return err
}

func (s *Store) Members(fileID string) ([]model.Member, error) {
	rows, err := s.db.Query(`SELECT m.user_id,u.name,u.email,u.color,u.avatar,m.role,m.created_at
		FROM file_members m JOIN users u ON u.id=m.user_id WHERE m.file_id=? ORDER BY m.created_at ASC`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Member{}
	for rows.Next() {
		var m model.Member
		if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Color, &m.Avatar, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ---------- comments ----------

func (s *Store) Comments(fileID string) ([]model.Comment, error) {
	rows, err := s.db.Query(`SELECT c.id,c.file_id,c.page_id,c.node_id,c.parent_id,c.x,c.y,c.text,c.author_id,u.name,u.color,u.avatar,c.resolved,c.created_at
		FROM comments c JOIN users u ON u.id=c.author_id WHERE c.file_id=? ORDER BY c.created_at ASC`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Comment{}
	for rows.Next() {
		var c model.Comment
		if err := rows.Scan(&c.ID, &c.FileID, &c.PageID, &c.NodeID, &c.ParentID, &c.X, &c.Y, &c.Text, &c.AuthorID,
			&c.Author, &c.Color, &c.Avatar, &c.Resolved, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) AddComment(c model.Comment) error {
	_, err := s.db.Exec(`INSERT INTO comments(id,file_id,page_id,node_id,parent_id,x,y,text,author_id,resolved,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)`, c.ID, c.FileID, c.PageID, c.NodeID, c.ParentID, c.X, c.Y, c.Text, c.AuthorID, c.Resolved, c.CreatedAt)
	return err
}

func (s *Store) UpdateComment(id string, resolved bool) error {
	_, err := s.db.Exec(`UPDATE comments SET resolved=? WHERE id=?`, resolved, id)
	return err
}

func (s *Store) DeleteComment(id string) error {
	_, err := s.db.Exec(`DELETE FROM comments WHERE id=?`, id)
	return err
}

func (s *Store) DeleteCommentReplies(parentID string) error {
	_, err := s.db.Exec(`DELETE FROM comments WHERE parent_id=?`, parentID)
	return err
}

func (s *Store) CommentParent(id string) (string, error) {
	var parent string
	err := s.db.QueryRow(`SELECT parent_id FROM comments WHERE id=?`, id).Scan(&parent)
	return parent, err
}

func (s *Store) CommentAuthor(id string) (string, error) {
	var author string
	err := s.db.QueryRow(`SELECT author_id FROM comments WHERE id=?`, id).Scan(&author)
	return author, err
}

func (s *Store) CommentFile(id string) (string, error) {
	var fileID string
	err := s.db.QueryRow(`SELECT file_id FROM comments WHERE id=?`, id).Scan(&fileID)
	return fileID, err
}

// ---------- versions ----------

func (s *Store) AddVersion(id, fileID, name, doc string, version int, authorID string) error {
	_, err := s.db.Exec(`INSERT INTO versions(id,file_id,name,doc,version,author_id,created_at) VALUES(?,?,?,?,?,?,?)`,
		id, fileID, name, doc, version, authorID, model.Now())
	return err
}

func (s *Store) Versions(fileID string) ([]model.VersionMeta, error) {
	rows, err := s.db.Query(`SELECT v.id,v.file_id,v.name,v.version,v.author_id,u.name,v.created_at
		FROM versions v JOIN users u ON u.id=v.author_id WHERE v.file_id=? ORDER BY v.created_at DESC`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.VersionMeta{}
	for rows.Next() {
		var v model.VersionMeta
		if err := rows.Scan(&v.ID, &v.FileID, &v.Name, &v.Version, &v.AuthorID, &v.Author, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) VersionDoc(fileID, versionID string) (string, int, error) {
	var doc string
	var version int
	err := s.db.QueryRow(`SELECT doc,version FROM versions WHERE id=? AND file_id=?`, versionID, fileID).Scan(&doc, &version)
	return doc, version, err
}

// ---------- personal access tokens ----------

type PATRecord struct {
	ID         string
	UserID     string
	Name       string
	Prefix     string
	TokenHash  string
	Scopes     string
	LastUsedAt string
	ExpiresAt  string
	CreatedAt  string
}

func (s *Store) CreatePAT(r PATRecord) error {
	_, err := s.db.Exec(`INSERT INTO personal_access_tokens(id,user_id,name,prefix,token_hash,scopes,last_used_at,expires_at,created_at)
		VALUES(?,?,?,?,?,?,?,?,?)`, r.ID, r.UserID, r.Name, r.Prefix, r.TokenHash, r.Scopes, r.LastUsedAt, r.ExpiresAt, r.CreatedAt)
	return err
}

func (s *Store) ListPATs(userID string) ([]PATRecord, error) {
	rows, err := s.db.Query(`SELECT id,user_id,name,prefix,scopes,last_used_at,expires_at,created_at
		FROM personal_access_tokens WHERE user_id=? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PATRecord{}
	for rows.Next() {
		var r PATRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.Name, &r.Prefix, &r.Scopes, &r.LastUsedAt, &r.ExpiresAt, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) PATByHash(hash string) (PATRecord, error) {
	var r PATRecord
	err := s.db.QueryRow(`SELECT id,user_id,name,prefix,token_hash,scopes,last_used_at,expires_at,created_at
		FROM personal_access_tokens WHERE token_hash=?`, hash).
		Scan(&r.ID, &r.UserID, &r.Name, &r.Prefix, &r.TokenHash, &r.Scopes, &r.LastUsedAt, &r.ExpiresAt, &r.CreatedAt)
	return r, err
}

func (s *Store) TouchPAT(id string) error {
	_, err := s.db.Exec(`UPDATE personal_access_tokens SET last_used_at=? WHERE id=?`, model.Now(), id)
	return err
}

func (s *Store) DeletePAT(id, userID string) error {
	res, err := s.db.Exec(`DELETE FROM personal_access_tokens WHERE id=? AND user_id=?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ---------- AI / BYOK settings ----------

type AISettingsRecord struct {
	UserID    string
	Provider  string
	BaseURL   string
	Model     string
	APIKeyEnc string
	UpdatedAt string
}

func (s *Store) AISettings(userID string) (AISettingsRecord, error) {
	var r AISettingsRecord
	err := s.db.QueryRow(`SELECT user_id,provider,base_url,model,api_key_enc,updated_at FROM ai_settings WHERE user_id=?`, userID).
		Scan(&r.UserID, &r.Provider, &r.BaseURL, &r.Model, &r.APIKeyEnc, &r.UpdatedAt)
	return r, err
}

func (s *Store) SaveAISettings(r AISettingsRecord) error {
	_, err := s.db.Exec(`INSERT INTO ai_settings(user_id,provider,base_url,model,api_key_enc,updated_at)
		VALUES(?,?,?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,
		model=excluded.model,api_key_enc=excluded.api_key_enc,updated_at=excluded.updated_at`,
		r.UserID, r.Provider, r.BaseURL, r.Model, r.APIKeyEnc, model.Now())
	return err
}

// ---------- AI context & skills ----------

type AgentContext struct {
	UserID    string
	DesignMD  string
	AgentsMD  string
	UpdatedAt string
}

func (s *Store) AIContext(userID string) (AgentContext, error) {
	var c AgentContext
	err := s.db.QueryRow(`SELECT user_id,design_md,agents_md,updated_at FROM ai_context WHERE user_id=?`, userID).
		Scan(&c.UserID, &c.DesignMD, &c.AgentsMD, &c.UpdatedAt)
	return c, err
}

func (s *Store) SaveAIContext(userID, designMD, agentsMD string) error {
	_, err := s.db.Exec(`INSERT INTO ai_context(user_id,design_md,agents_md,updated_at) VALUES(?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET design_md=excluded.design_md, agents_md=excluded.agents_md, updated_at=excluded.updated_at`,
		userID, designMD, agentsMD, model.Now())
	return err
}

type SkillRecord struct {
	ID          string
	UserID      string
	Name        string
	Description string
	Content     string
	CreatedAt   string
	UpdatedAt   string
}

func (s *Store) ListSkills(userID string) ([]SkillRecord, error) {
	rows, err := s.db.Query(`SELECT id,user_id,name,description,content,created_at,updated_at FROM ai_skills WHERE user_id=? ORDER BY name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SkillRecord{}
	for rows.Next() {
		var r SkillRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.Name, &r.Description, &r.Content, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) UpsertSkill(r SkillRecord) (SkillRecord, error) {
	now := model.Now()
	_, err := s.db.Exec(`INSERT INTO ai_skills(id,user_id,name,description,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(user_id,name) DO UPDATE SET description=excluded.description, content=excluded.content, updated_at=excluded.updated_at`,
		r.ID, r.UserID, r.Name, r.Description, r.Content, now, now)
	if err != nil {
		return SkillRecord{}, err
	}
	var out SkillRecord
	err = s.db.QueryRow(`SELECT id,user_id,name,description,content,created_at,updated_at FROM ai_skills WHERE user_id=? AND name=?`, r.UserID, r.Name).
		Scan(&out.ID, &out.UserID, &out.Name, &out.Description, &out.Content, &out.CreatedAt, &out.UpdatedAt)
	return out, err
}

func (s *Store) DeleteSkill(id, userID string) error {
	res, err := s.db.Exec(`DELETE FROM ai_skills WHERE id=? AND user_id=?`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ---------- public links ----------

func (s *Store) PublicLink(fileID string) (string, bool, error) {
	var token string
	var enabled int
	err := s.db.QueryRow(`SELECT token, enabled FROM public_links WHERE file_id=?`, fileID).Scan(&token, &enabled)
	return token, enabled != 0, err
}

func (s *Store) SetPublicLink(fileID, token string, enabled bool) error {
	_, err := s.db.Exec(`INSERT INTO public_links(file_id,token,enabled,created_at) VALUES(?,?,?,?)
		ON CONFLICT(file_id) DO UPDATE SET enabled=excluded.enabled`, fileID, token, enabled, model.Now())
	return err
}

func (s *Store) FileByPublicToken(token string) (model.File, error) {
	var f model.File
	err := s.db.QueryRow(`SELECT f.id,f.name,f.owner_id,f.doc,f.version,f.thumbnail,f.template,f.created_at,f.updated_at
		FROM files f JOIN public_links l ON l.file_id=f.id WHERE l.token=? AND l.enabled=1`, token).
		Scan(&f.ID, &f.Name, &f.OwnerID, &f.Doc, &f.Version, &f.Thumbnail, &f.Template, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

// ---------- notifications ----------

func (s *Store) AccessUsers(fileID string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	rows, err := s.db.Query(`SELECT owner_id FROM files WHERE id=? UNION SELECT user_id FROM file_members WHERE file_id=?`, fileID, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// AddNotificationFor creates a notification for one recipient.
func (s *Store) AddNotificationFor(id, userID, fileID, commentID, actorID, kind, text string) error {
	_, err := s.db.Exec(`INSERT INTO notifications(id,user_id,file_id,comment_id,actor_id,kind,text,read,created_at)
		VALUES(?,?,?,?,?,?,?,0,?)`, id, userID, fileID, commentID, actorID, kind, text, model.Now())
	return err
}

func (s *Store) Notifications(userID string) ([]model.Notification, error) {
	rows, err := s.db.Query(`SELECT n.id,n.kind,n.file_id,f.name,n.comment_id,n.actor_id,u.name,u.color,u.avatar,n.text,n.read,n.created_at
		FROM notifications n JOIN files f ON f.id=n.file_id JOIN users u ON u.id=n.actor_id
		WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Notification{}
	for rows.Next() {
		var n model.Notification
		var read int
		if err := rows.Scan(&n.ID, &n.Type, &n.FileID, &n.FileName, &n.CommentID, &n.ActorID, &n.Actor, &n.Color, &n.Avatar, &n.Text, &read, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.Read = read != 0
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) MarkNotificationsRead(userID string) error {
	_, err := s.db.Exec(`UPDATE notifications SET read=1 WHERE user_id=? AND read=0`, userID)
	return err
}

func (s *Store) AddAuditLog(id, fileID, actorID, action, meta string) error {
	_, err := s.db.Exec(`INSERT INTO audit_logs(id,file_id,actor_id,action,meta,created_at) VALUES(?,?,?,?,?,?)`, id, fileID, actorID, action, meta, model.Now())
	return err
}

func (s *Store) CleanupExpiredPATs() error {
	_, err := s.db.Exec(`DELETE FROM personal_access_tokens WHERE expires_at != '' AND expires_at < ?`, model.Now())
	return err
}

func ErrNotFound(err error) bool { return errors.Is(err, sql.ErrNoRows) }
