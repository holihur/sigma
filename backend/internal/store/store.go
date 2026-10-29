package store

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"sigma/internal/model"
)

type Store struct {
	client *mongo.Client
	db     *mongo.Database
}

// Open connects to MongoDB. The argument is a database name; path-like values
// are hashed into an isolated test database so existing tests stay independent.
func Open(name string) (*Store, error) {
	uri := strings.TrimSpace(os.Getenv("MONGO_URI"))
	if uri == "" {
		uri = "mongodb://127.0.0.1:27017"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("connect mongo: %w", err)
	}
	s := &Store{client: client, db: client.Database(mongoDatabaseName(name))}
	if err := s.ensureIndexes(ctx); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.client.Disconnect(ctx)
}

func (s *Store) Ping() error {
	ctx, cancel := s.ctx()
	defer cancel()
	return s.client.Ping(ctx, nil)
}

func (s *Store) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 8*time.Second)
}

func mongoDatabaseName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("MONGO_DB"))
	}
	if raw == "" {
		raw = "sigma"
	}
	// Tests still pass temporary filesystem paths. Hash them into isolated
	// database names without leaking long paths.
	if strings.ContainsAny(raw, `/\`) || strings.HasSuffix(strings.ToLower(raw), ".db") {
		sum := sha1.Sum([]byte(raw))
		return "sigma_test_" + hex.EncodeToString(sum[:8])
	}
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	name := strings.Trim(b.String(), "_")
	if name == "" {
		name = "sigma"
	}
	if len(name) > 60 {
		sum := sha1.Sum([]byte(name))
		name = "sigma_" + hex.EncodeToString(sum[:8])
	}
	return name
}

func (s *Store) ensureIndexes(ctx context.Context) error {
	type indexSet struct {
		collection string
		models     []mongo.IndexModel
	}
	sets := []indexSet{
		{"users", []mongo.IndexModel{{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true)}}},
		{"files", []mongo.IndexModel{{Keys: bson.D{{Key: "owner_id", Value: 1}}}, {Keys: bson.D{{Key: "updated_at", Value: -1}}}}},
		{"file_members", []mongo.IndexModel{
			{Keys: bson.D{{Key: "file_id", Value: 1}, {Key: "user_id", Value: 1}}, Options: options.Index().SetUnique(true)},
			{Keys: bson.D{{Key: "user_id", Value: 1}}},
		}},
		{"file_stars", []mongo.IndexModel{{Keys: bson.D{{Key: "file_id", Value: 1}, {Key: "user_id", Value: 1}}, Options: options.Index().SetUnique(true)}}},
		{"comments", []mongo.IndexModel{{Keys: bson.D{{Key: "file_id", Value: 1}, {Key: "created_at", Value: 1}}}}},
		{"versions", []mongo.IndexModel{{Keys: bson.D{{Key: "file_id", Value: 1}, {Key: "created_at", Value: -1}}}}},
		{"public_links", []mongo.IndexModel{{Keys: bson.D{{Key: "token", Value: 1}}, Options: options.Index().SetUnique(true)}}},
		{"personal_access_tokens", []mongo.IndexModel{
			{Keys: bson.D{{Key: "token_hash", Value: 1}}, Options: options.Index().SetUnique(true)},
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}}},
		}},
		{"user_identities", []mongo.IndexModel{
			{Keys: bson.D{{Key: "issuer", Value: 1}, {Key: "subject", Value: 1}}, Options: options.Index().SetUnique(true)},
			{Keys: bson.D{{Key: "user_id", Value: 1}}},
		}},
		{"ai_skills", []mongo.IndexModel{
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "name", Value: 1}}, Options: options.Index().SetUnique(true)},
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "updated_at", Value: -1}}},
		}},
		{"notifications", []mongo.IndexModel{{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "read", Value: 1}, {Key: "created_at", Value: -1}}}}},
		{"audit_logs", []mongo.IndexModel{
			{Keys: bson.D{{Key: "file_id", Value: 1}, {Key: "created_at", Value: -1}}},
			{Keys: bson.D{{Key: "actor_id", Value: 1}, {Key: "created_at", Value: -1}}},
		}},
	}
	for _, set := range sets {
		if _, err := s.db.Collection(set.collection).Indexes().CreateMany(ctx, set.models); err != nil {
			return fmt.Errorf("indexes %s: %w", set.collection, err)
		}
	}
	return nil
}

type userDoc struct {
	ID               string `bson:"_id"`
	Name             string `bson:"name"`
	Email            string `bson:"email"`
	Password         string `bson:"password"`
	PasswordDisabled bool   `bson:"password_disabled,omitempty"`
	Color            string `bson:"color"`
	Avatar           string `bson:"avatar"`
	CreatedAt        string `bson:"created_at"`
}

func (d userDoc) model() model.User {
	return model.User{ID: d.ID, Name: d.Name, Email: d.Email, Color: d.Color, Avatar: d.Avatar, CreatedAt: d.CreatedAt}
}

type fileDoc struct {
	ID        string `bson:"_id"`
	Name      string `bson:"name"`
	OwnerID   string `bson:"owner_id"`
	Doc       string `bson:"doc"`
	Version   int    `bson:"version"`
	Thumbnail string `bson:"thumbnail"`
	Template  string `bson:"template"`
	Folder    string `bson:"folder"`
	CreatedAt string `bson:"created_at"`
	UpdatedAt string `bson:"updated_at"`
}

func (d fileDoc) model() model.File {
	return model.File{ID: d.ID, Name: d.Name, OwnerID: d.OwnerID, Doc: d.Doc, Version: d.Version,
		Thumbnail: d.Thumbnail, Template: d.Template, Folder: d.Folder, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
}

type memberDoc struct {
	ID        string `bson:"_id"`
	FileID    string `bson:"file_id"`
	UserID    string `bson:"user_id"`
	Role      string `bson:"role"`
	CreatedAt string `bson:"created_at"`
}

type starDoc struct {
	ID     string `bson:"_id"`
	FileID string `bson:"file_id"`
	UserID string `bson:"user_id"`
}

type commentDoc struct {
	ID        string  `bson:"_id"`
	FileID    string  `bson:"file_id"`
	PageID    string  `bson:"page_id"`
	NodeID    string  `bson:"node_id"`
	ParentID  string  `bson:"parent_id"`
	X         float64 `bson:"x"`
	Y         float64 `bson:"y"`
	Text      string  `bson:"text"`
	AuthorID  string  `bson:"author_id"`
	Resolved  bool    `bson:"resolved"`
	CreatedAt string  `bson:"created_at"`
}

type versionDoc struct {
	ID        string `bson:"_id"`
	FileID    string `bson:"file_id"`
	Name      string `bson:"name"`
	Doc       string `bson:"doc"`
	Version   int    `bson:"version"`
	AuthorID  string `bson:"author_id"`
	CreatedAt string `bson:"created_at"`
}

type publicLinkDoc struct {
	FileID       string `bson:"_id"`
	Token        string `bson:"token"`
	Enabled      bool   `bson:"enabled"`
	ExpiresAt    int64  `bson:"expires_at"`
	PasswordHash string `bson:"password_hash"`
	CreatedAt    string `bson:"created_at"`
}

type patDoc struct {
	ID         string `bson:"_id"`
	UserID     string `bson:"user_id"`
	Name       string `bson:"name"`
	Prefix     string `bson:"prefix"`
	TokenHash  string `bson:"token_hash"`
	Scopes     string `bson:"scopes"`
	LastUsedAt string `bson:"last_used_at"`
	ExpiresAt  string `bson:"expires_at"`
	CreatedAt  string `bson:"created_at"`
}

type aiSettingsDoc struct {
	UserID    string `bson:"_id"`
	Provider  string `bson:"provider"`
	BaseURL   string `bson:"base_url"`
	Model     string `bson:"model"`
	APIKeyEnc string `bson:"api_key_enc"`
	UpdatedAt string `bson:"updated_at"`
}

type aiContextDoc struct {
	UserID    string `bson:"_id"`
	DesignMD  string `bson:"design_md"`
	AgentsMD  string `bson:"agents_md"`
	UpdatedAt string `bson:"updated_at"`
}

type skillDoc struct {
	ID          string `bson:"_id"`
	UserID      string `bson:"user_id"`
	Name        string `bson:"name"`
	Description string `bson:"description"`
	Content     string `bson:"content"`
	CreatedAt   string `bson:"created_at"`
	UpdatedAt   string `bson:"updated_at"`
}

type identityDoc struct {
	ID        string `bson:"_id"`
	Issuer    string `bson:"issuer"`
	Subject   string `bson:"subject"`
	UserID    string `bson:"user_id"`
	Email     string `bson:"email"`
	CreatedAt string `bson:"created_at"`
}

type notificationDoc struct {
	ID        string `bson:"_id"`
	UserID    string `bson:"user_id"`
	FileID    string `bson:"file_id"`
	CommentID string `bson:"comment_id"`
	ActorID   string `bson:"actor_id"`
	Kind      string `bson:"kind"`
	Text      string `bson:"text"`
	Read      bool   `bson:"read"`
	CreatedAt string `bson:"created_at"`
}

type auditDoc struct {
	ID        string `bson:"_id"`
	FileID    string `bson:"file_id"`
	ActorID   string `bson:"actor_id"`
	Action    string `bson:"action"`
	Meta      string `bson:"meta"`
	CreatedAt string `bson:"created_at"`
}

func (s *Store) collection(name string) *mongo.Collection { return s.db.Collection(name) }

// ---------- users ----------

func (s *Store) CreateUser(id, name, email, passwordHash, color string) (model.User, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	now := model.Now()
	email = strings.ToLower(strings.TrimSpace(email))
	d := userDoc{ID: id, Name: name, Email: email, Password: passwordHash, Color: color, CreatedAt: now}
	if _, err := s.collection("users").InsertOne(ctx, d); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return model.User{}, fmt.Errorf("unique email: %w", err)
		}
		return model.User{}, err
	}
	return d.model(), nil
}

func (s *Store) PasswordDisabled(userID string) bool {
	ctx, cancel := s.ctx()
	defer cancel()
	var d userDoc
	if err := s.collection("users").FindOne(ctx, bson.M{"_id": userID}).Decode(&d); err != nil {
		return false
	}
	return d.PasswordDisabled
}

func (s *Store) SetPasswordDisabled(userID string, disabled bool) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("users").UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"password_disabled": disabled}})
	return err
}

func (s *Store) UserByEmail(email string) (model.User, string, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d userDoc
	err := s.collection("users").FindOne(ctx, bson.M{"email": strings.ToLower(strings.TrimSpace(email))}).Decode(&d)
	return d.model(), d.Password, err
}

func (s *Store) UserByID(id string) (model.User, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d userDoc
	err := s.collection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&d)
	return d.model(), err
}

func (s *Store) UpdateUserProfile(id, name, color, avatar string) (model.User, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("users").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"name": name, "color": color, "avatar": avatar}})
	if err != nil {
		return model.User{}, err
	}
	return s.UserByID(id)
}

func (s *Store) UserByIdentity(issuer, subject string) (model.User, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d identityDoc
	if err := s.collection("user_identities").FindOne(ctx, bson.M{"_id": identityID(issuer, subject)}).Decode(&d); err != nil {
		return model.User{}, err
	}
	return s.UserByID(d.UserID)
}

func (s *Store) LinkIdentity(issuer, subject, userID, email string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("user_identities").UpdateOne(ctx,
		bson.M{"_id": identityID(issuer, subject)},
		bson.M{"$set": bson.M{"issuer": issuer, "subject": subject, "user_id": userID, "email": strings.ToLower(email), "created_at": model.Now()}},
		options.Update().SetUpsert(true))
	return err
}

func identityID(issuer, subject string) string { return issuer + "\x00" + subject }

// ---------- files ----------

func (s *Store) CreateFile(id, name, ownerID, doc, template string) (model.FileMeta, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	now := model.Now()
	d := fileDoc{ID: id, Name: name, OwnerID: ownerID, Doc: doc, Version: 1, Template: template, CreatedAt: now, UpdatedAt: now}
	if _, err := s.collection("files").InsertOne(ctx, d); err != nil {
		return model.FileMeta{}, err
	}
	return s.FileMeta(id, ownerID)
}

func (s *Store) File(id string) (model.File, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d fileDoc
	if err := s.collection("files").FindOne(ctx, bson.M{"_id": id}).Decode(&d); err != nil {
		return model.File{}, err
	}
	return d.model(), nil
}

func (s *Store) FileMeta(id, userID string) (model.FileMeta, error) {
	f, err := s.File(id)
	if err != nil {
		return model.FileMeta{}, err
	}
	owner, _ := s.UserByID(f.OwnerID)
	role := ""
	if f.OwnerID == userID {
		role = "owner"
	} else {
		ctx, cancel := s.ctx()
		defer cancel()
		var member memberDoc
		if err := s.collection("file_members").FindOne(ctx, bson.M{"file_id": id, "user_id": userID}).Decode(&member); err == nil {
			role = member.Role
		}
	}
	ctx, cancel := s.ctx()
	defer cancel()
	starred, _ := s.collection("file_stars").CountDocuments(ctx, bson.M{"file_id": id, "user_id": userID})
	return metaFromFile(f, owner.Name, role, starred > 0), nil
}

func metaFromFile(f model.File, ownerName, role string, starred bool) model.FileMeta {
	thumb := ""
	if f.Thumbnail != "" {
		thumb = "/api/files/" + f.ID + "/thumbnail"
	}
	return model.FileMeta{ID: f.ID, Name: f.Name, OwnerID: f.OwnerID, OwnerName: ownerName, Version: f.Version,
		Thumbnail: thumb, Template: f.Template, Folder: f.Folder, Role: role, Starred: starred,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt}
}

func (s *Store) fileFilter(ctx context.Context, userID string) bson.M {
	memberFileIDs, _ := s.collection("file_members").Distinct(ctx, "file_id", bson.M{"user_id": userID})
	or := []bson.M{{"owner_id": userID}}
	if len(memberFileIDs) > 0 {
		or = append(or, bson.M{"_id": bson.M{"$in": memberFileIDs}})
	}
	return bson.M{"$or": or}
}

func (s *Store) listFiles(userID string, limit, offset int) ([]model.FileMeta, int, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	filter := s.fileFilter(ctx, userID)
	total, err := s.collection("files").CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	find := options.Find().SetSort(bson.D{{Key: "updated_at", Value: -1}})
	if limit > 0 {
		find = find.SetLimit(int64(limit)).SetSkip(int64(offset))
	}
	cursor, err := s.collection("files").Find(ctx, filter, find)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)
	files := []fileDoc{}
	if err := cursor.All(ctx, &files); err != nil {
		return nil, 0, err
	}
	if len(files) == 0 {
		return []model.FileMeta{}, int(total), nil
	}
	ownerIDs := make([]string, 0, len(files))
	fileIDs := make([]string, 0, len(files))
	for _, f := range files {
		ownerIDs = append(ownerIDs, f.OwnerID)
		fileIDs = append(fileIDs, f.ID)
	}
	owners := s.usersByIDs(ctx, ownerIDs)
	roleCursor, _ := s.collection("file_members").Find(ctx, bson.M{"user_id": userID, "file_id": bson.M{"$in": fileIDs}})
	roles := map[string]string{}
	if roleCursor != nil {
		var members []memberDoc
		_ = roleCursor.All(ctx, &members)
		for _, m := range members {
			roles[m.FileID] = m.Role
		}
	}
	starCursor, _ := s.collection("file_stars").Find(ctx, bson.M{"user_id": userID, "file_id": bson.M{"$in": fileIDs}})
	stars := map[string]bool{}
	if starCursor != nil {
		var list []starDoc
		_ = starCursor.All(ctx, &list)
		for _, st := range list {
			stars[st.FileID] = true
		}
	}
	out := make([]model.FileMeta, 0, len(files))
	for _, f := range files {
		role := ""
		if f.OwnerID == userID {
			role = "owner"
		} else {
			role = roles[f.ID]
		}
		owner := owners[f.OwnerID]
		out = append(out, metaFromFile(f.model(), owner.Name, role, stars[f.ID]))
	}
	return out, int(total), nil
}

func (s *Store) ListFiles(userID string) ([]model.FileMeta, error) {
	out, _, err := s.listFiles(userID, 0, 0)
	return out, err
}

func (s *Store) ListFilesPage(userID string, limit, offset int) ([]model.FileMeta, int, error) {
	return s.listFiles(userID, limit, offset)
}

func (s *Store) usersByIDs(ctx context.Context, ids []string) map[string]userDoc {
	out := map[string]userDoc{}
	if len(ids) == 0 {
		return out
	}
	cursor, err := s.collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return out
	}
	var users []userDoc
	_ = cursor.All(ctx, &users)
	for _, u := range users {
		out[u.ID] = u
	}
	return out
}

func (s *Store) SetFolder(id, folder string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("files").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"folder": folder, "updated_at": model.Now()}})
	return err
}

func (s *Store) RenameFile(id, name string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("files").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"name": name, "updated_at": model.Now()}})
	return err
}

func (s *Store) SetThumbnail(id, thumb string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("files").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"thumbnail": thumb}})
	return err
}

func (s *Store) SaveDoc(id, doc string, version int) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("files").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"doc": doc, "version": version, "updated_at": model.Now()}})
	return err
}

func (s *Store) DeleteFile(id string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	if _, err := s.collection("files").DeleteOne(ctx, bson.M{"_id": id}); err != nil {
		return err
	}
	for _, c := range []string{"file_members", "file_stars", "comments", "versions", "notifications", "public_links"} {
		filter := bson.M{"file_id": id}
		if c == "public_links" {
			filter = bson.M{"_id": id}
		}
		if _, err := s.collection(c).DeleteMany(ctx, filter); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) SetStar(fileID, userID string, starred bool) error {
	ctx, cancel := s.ctx()
	defer cancel()
	id := fileID + "\x00" + userID
	if starred {
		_, err := s.collection("file_stars").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"file_id": fileID, "user_id": userID}}, options.Update().SetUpsert(true))
		return err
	}
	_, err := s.collection("file_stars").DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// RoleFor returns "owner", "edit", "view" or "".
func (s *Store) RoleFor(fileID, userID string) string {
	ctx, cancel := s.ctx()
	defer cancel()
	var f fileDoc
	if err := s.collection("files").FindOne(ctx, bson.M{"_id": fileID}).Decode(&f); err != nil {
		return ""
	}
	if f.OwnerID == userID {
		return "owner"
	}
	var m memberDoc
	if err := s.collection("file_members").FindOne(ctx, bson.M{"file_id": fileID, "user_id": userID}).Decode(&m); err != nil {
		return ""
	}
	return m.Role
}

// ---------- members ----------

func (s *Store) AddMember(fileID, userID, role string) error {
	if role != "edit" && role != "view" {
		role = "edit"
	}
	ctx, cancel := s.ctx()
	defer cancel()
	id := fileID + "\x00" + userID
	_, err := s.collection("file_members").UpdateOne(ctx, bson.M{"_id": id},
		bson.M{"$set": bson.M{"file_id": fileID, "user_id": userID, "role": role}, "$setOnInsert": bson.M{"created_at": model.Now()}},
		options.Update().SetUpsert(true))
	return err
}

func (s *Store) RemoveMember(fileID, userID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("file_members").DeleteOne(ctx, bson.M{"_id": fileID + "\x00" + userID})
	return err
}

func (s *Store) Members(fileID string) ([]model.Member, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("file_members").Find(ctx, bson.M{"file_id": fileID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var members []memberDoc
	if err := cursor.All(ctx, &members); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	users := s.usersByIDs(ctx, ids)
	out := make([]model.Member, 0, len(members))
	for _, m := range members {
		u := users[m.UserID]
		out = append(out, model.Member{UserID: m.UserID, Name: u.Name, Email: u.Email, Color: u.Color, Avatar: u.Avatar, Role: m.Role, CreatedAt: m.CreatedAt})
	}
	return out, nil
}

// ---------- comments ----------

func (s *Store) Comments(fileID string) ([]model.Comment, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("comments").Find(ctx, bson.M{"file_id": fileID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var comments []commentDoc
	if err := cursor.All(ctx, &comments); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(comments))
	for _, c := range comments {
		ids = append(ids, c.AuthorID)
	}
	users := s.usersByIDs(ctx, ids)
	out := make([]model.Comment, 0, len(comments))
	for _, c := range comments {
		u := users[c.AuthorID]
		out = append(out, model.Comment{ID: c.ID, FileID: c.FileID, PageID: c.PageID, NodeID: c.NodeID, ParentID: c.ParentID,
			X: c.X, Y: c.Y, Text: c.Text, AuthorID: c.AuthorID, Author: u.Name, Color: u.Color, Avatar: u.Avatar,
			Resolved: c.Resolved, CreatedAt: c.CreatedAt})
	}
	return out, nil
}

func (s *Store) AddComment(c model.Comment) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("comments").InsertOne(ctx, commentDoc{ID: c.ID, FileID: c.FileID, PageID: c.PageID, NodeID: c.NodeID, ParentID: c.ParentID,
		X: c.X, Y: c.Y, Text: c.Text, AuthorID: c.AuthorID, Resolved: c.Resolved, CreatedAt: c.CreatedAt})
	return err
}

func (s *Store) UpdateComment(id string, resolved bool) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("comments").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"resolved": resolved}})
	return err
}

func (s *Store) DeleteComment(id string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("comments").DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (s *Store) DeleteCommentReplies(parentID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("comments").DeleteMany(ctx, bson.M{"parent_id": parentID})
	return err
}

func (s *Store) CommentParent(id string) (string, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var c commentDoc
	err := s.collection("comments").FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	return c.ParentID, err
}

func (s *Store) CommentAuthor(id string) (string, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var c commentDoc
	err := s.collection("comments").FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	return c.AuthorID, err
}

func (s *Store) CommentFile(id string) (string, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var c commentDoc
	err := s.collection("comments").FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	return c.FileID, err
}

// ---------- versions ----------

func (s *Store) AddVersion(id, fileID, name, doc string, version int, authorID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("versions").InsertOne(ctx, versionDoc{ID: id, FileID: fileID, Name: name, Doc: doc, Version: version, AuthorID: authorID, CreatedAt: model.Now()})
	return err
}

func (s *Store) Versions(fileID string) ([]model.VersionMeta, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("versions").Find(ctx, bson.M{"file_id": fileID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var versions []versionDoc
	if err := cursor.All(ctx, &versions); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(versions))
	for _, v := range versions {
		ids = append(ids, v.AuthorID)
	}
	users := s.usersByIDs(ctx, ids)
	out := make([]model.VersionMeta, 0, len(versions))
	for _, v := range versions {
		out = append(out, model.VersionMeta{ID: v.ID, FileID: v.FileID, Name: v.Name, Version: v.Version, AuthorID: v.AuthorID, Author: users[v.AuthorID].Name, CreatedAt: v.CreatedAt})
	}
	return out, nil
}

func (s *Store) VersionDoc(fileID, versionID string) (string, int, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var v versionDoc
	err := s.collection("versions").FindOne(ctx, bson.M{"_id": versionID, "file_id": fileID}).Decode(&v)
	return v.Doc, v.Version, err
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
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("personal_access_tokens").InsertOne(ctx, patDoc{ID: r.ID, UserID: r.UserID, Name: r.Name, Prefix: r.Prefix, TokenHash: r.TokenHash,
		Scopes: r.Scopes, LastUsedAt: r.LastUsedAt, ExpiresAt: r.ExpiresAt, CreatedAt: r.CreatedAt})
	return err
}

func (s *Store) ListPATs(userID string) ([]PATRecord, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("personal_access_tokens").Find(ctx, bson.M{"user_id": userID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var docs []patDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]PATRecord, 0, len(docs))
	for _, d := range docs {
		out = append(out, PATRecord{ID: d.ID, UserID: d.UserID, Name: d.Name, Prefix: d.Prefix, TokenHash: d.TokenHash,
			Scopes: d.Scopes, LastUsedAt: d.LastUsedAt, ExpiresAt: d.ExpiresAt, CreatedAt: d.CreatedAt})
	}
	return out, nil
}

func (s *Store) PATByHash(hash string) (PATRecord, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d patDoc
	err := s.collection("personal_access_tokens").FindOne(ctx, bson.M{"token_hash": hash}).Decode(&d)
	return PATRecord{ID: d.ID, UserID: d.UserID, Name: d.Name, Prefix: d.Prefix, TokenHash: d.TokenHash,
		Scopes: d.Scopes, LastUsedAt: d.LastUsedAt, ExpiresAt: d.ExpiresAt, CreatedAt: d.CreatedAt}, err
}

func (s *Store) TouchPAT(id string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("personal_access_tokens").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"last_used_at": model.Now()}})
	return err
}

func (s *Store) DeletePAT(id, userID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	res, err := s.collection("personal_access_tokens").DeleteOne(ctx, bson.M{"_id": id, "user_id": userID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return mongo.ErrNoDocuments
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
	ctx, cancel := s.ctx()
	defer cancel()
	var d aiSettingsDoc
	err := s.collection("ai_settings").FindOne(ctx, bson.M{"_id": userID}).Decode(&d)
	return AISettingsRecord{UserID: d.UserID, Provider: d.Provider, BaseURL: d.BaseURL, Model: d.Model, APIKeyEnc: d.APIKeyEnc, UpdatedAt: d.UpdatedAt}, err
}

func (s *Store) SaveAISettings(r AISettingsRecord) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("ai_settings").UpdateOne(ctx, bson.M{"_id": r.UserID},
		bson.M{"$set": bson.M{"provider": r.Provider, "base_url": r.BaseURL, "model": r.Model, "api_key_enc": r.APIKeyEnc, "updated_at": model.Now()}},
		options.Update().SetUpsert(true))
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
	ctx, cancel := s.ctx()
	defer cancel()
	var d aiContextDoc
	err := s.collection("ai_context").FindOne(ctx, bson.M{"_id": userID}).Decode(&d)
	return AgentContext{UserID: d.UserID, DesignMD: d.DesignMD, AgentsMD: d.AgentsMD, UpdatedAt: d.UpdatedAt}, err
}

func (s *Store) SaveAIContext(userID, designMD, agentsMD string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("ai_context").UpdateOne(ctx, bson.M{"_id": userID},
		bson.M{"$set": bson.M{"design_md": designMD, "agents_md": agentsMD, "updated_at": model.Now()}}, options.Update().SetUpsert(true))
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
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("ai_skills").Find(ctx, bson.M{"user_id": userID}, options.Find().SetSort(bson.D{{Key: "name", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []skillDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]SkillRecord, 0, len(docs))
	for _, d := range docs {
		out = append(out, SkillRecord{ID: d.ID, UserID: d.UserID, Name: d.Name, Description: d.Description, Content: d.Content, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt})
	}
	return out, nil
}

func (s *Store) UpsertSkill(r SkillRecord) (SkillRecord, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	now := model.Now()
	_, err := s.collection("ai_skills").UpdateOne(ctx, bson.M{"user_id": r.UserID, "name": r.Name},
		bson.M{"$set": bson.M{"description": r.Description, "content": r.Content, "updated_at": now},
			"$setOnInsert": bson.M{"_id": r.ID, "user_id": r.UserID, "name": r.Name, "created_at": now}},
		options.Update().SetUpsert(true))
	if err != nil {
		return SkillRecord{}, err
	}
	var d skillDoc
	err = s.collection("ai_skills").FindOne(ctx, bson.M{"user_id": r.UserID, "name": r.Name}).Decode(&d)
	return SkillRecord{ID: d.ID, UserID: d.UserID, Name: d.Name, Description: d.Description, Content: d.Content, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}, err
}

func (s *Store) DeleteSkill(id, userID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	res, err := s.collection("ai_skills").DeleteOne(ctx, bson.M{"_id": id, "user_id": userID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

// ---------- public links ----------

type PublicLinkSettings struct {
	Token        string
	Enabled      bool
	ExpiresAt    int64
	PasswordHash string
}

func (s *Store) PublicLink(fileID string) (PublicLinkSettings, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var d publicLinkDoc
	err := s.collection("public_links").FindOne(ctx, bson.M{"_id": fileID}).Decode(&d)
	return PublicLinkSettings{Token: d.Token, Enabled: d.Enabled, ExpiresAt: d.ExpiresAt, PasswordHash: d.PasswordHash}, err
}

func (s *Store) SetPublicLink(fileID, token string, enabled bool, expiresAt int64, passwordHash string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("public_links").UpdateOne(ctx, bson.M{"_id": fileID},
		bson.M{"$set": bson.M{"token": token, "enabled": enabled, "expires_at": expiresAt, "password_hash": passwordHash},
			"$setOnInsert": bson.M{"created_at": model.Now()}},
		options.Update().SetUpsert(true))
	return err
}

func (s *Store) FileByPublicToken(token string) (model.File, string, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	var link publicLinkDoc
	err := s.collection("public_links").FindOne(ctx, bson.M{"token": token, "enabled": true,
		"$or": []bson.M{{"expires_at": 0}, {"expires_at": bson.M{"$gt": time.Now().UnixMilli()}}}}).Decode(&link)
	if err != nil {
		return model.File{}, "", err
	}
	f, err := s.File(link.FileID)
	return f, link.PasswordHash, err
}

// ---------- notifications ----------

func (s *Store) AccessUsers(fileID string) ([]string, error) {
	f, err := s.File(fileID)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{f.OwnerID: true}
	out := []string{f.OwnerID}
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("file_members").Find(ctx, bson.M{"file_id": fileID})
	if err != nil {
		return nil, err
	}
	var members []memberDoc
	if err := cursor.All(ctx, &members); err != nil {
		return nil, err
	}
	for _, m := range members {
		if !seen[m.UserID] {
			seen[m.UserID] = true
			out = append(out, m.UserID)
		}
	}
	return out, nil
}

func (s *Store) AddNotificationFor(id, userID, fileID, commentID, actorID, kind, text string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("notifications").InsertOne(ctx, notificationDoc{ID: id, UserID: userID, FileID: fileID, CommentID: commentID, ActorID: actorID,
		Kind: kind, Text: text, Read: false, CreatedAt: model.Now()})
	return err
}

func (s *Store) Notifications(userID string) ([]model.Notification, error) {
	ctx, cancel := s.ctx()
	defer cancel()
	cursor, err := s.collection("notifications").Find(ctx, bson.M{"user_id": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(50))
	if err != nil {
		return nil, err
	}
	var docs []notificationDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	fileIDs := make([]string, 0, len(docs))
	actorIDs := make([]string, 0, len(docs))
	for _, n := range docs {
		fileIDs = append(fileIDs, n.FileID)
		actorIDs = append(actorIDs, n.ActorID)
	}
	users := s.usersByIDs(ctx, actorIDs)
	fileNames := map[string]string{}
	if len(fileIDs) > 0 {
		fc, _ := s.collection("files").Find(ctx, bson.M{"_id": bson.M{"$in": fileIDs}})
		if fc != nil {
			var files []fileDoc
			_ = fc.All(ctx, &files)
			for _, f := range files {
				fileNames[f.ID] = f.Name
			}
		}
	}
	out := make([]model.Notification, 0, len(docs))
	for _, n := range docs {
		u := users[n.ActorID]
		out = append(out, model.Notification{ID: n.ID, Type: n.Kind, FileID: n.FileID, FileName: fileNames[n.FileID], CommentID: n.CommentID,
			ActorID: n.ActorID, Actor: u.Name, Color: u.Color, Avatar: u.Avatar, Text: n.Text, Read: n.Read, CreatedAt: n.CreatedAt})
	}
	return out, nil
}

func (s *Store) MarkNotificationsRead(userID string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("notifications").UpdateMany(ctx, bson.M{"user_id": userID, "read": false}, bson.M{"$set": bson.M{"read": true}})
	return err
}

func (s *Store) AddAuditLog(id, fileID, actorID, action, meta string) error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("audit_logs").InsertOne(ctx, auditDoc{ID: id, FileID: fileID, ActorID: actorID, Action: action, Meta: meta, CreatedAt: model.Now()})
	return err
}

func (s *Store) CleanupExpiredPATs() error {
	ctx, cancel := s.ctx()
	defer cancel()
	_, err := s.collection("personal_access_tokens").DeleteMany(ctx, bson.M{"expires_at": bson.M{"$ne": "", "$lt": model.Now()}})
	return err
}

func ErrNotFound(err error) bool { return errors.Is(err, mongo.ErrNoDocuments) }
