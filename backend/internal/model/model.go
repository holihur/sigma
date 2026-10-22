package model

import "time"

// User is a public-facing account representation (never includes secrets).
type User struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Color     string `json:"color"`
	Avatar    string `json:"avatar,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// File is a design document row.
type File struct {
	ID        string
	Name      string
	OwnerID   string
	Doc       string
	Version   int
	Thumbnail string
	Template  string
	Folder    string
	CreatedAt string
	UpdatedAt string
}

// FileMeta is the dashboard representation of a file.
type FileMeta struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	OwnerID   string `json:"ownerId"`
	OwnerName string `json:"ownerName"`
	Version   int    `json:"version"`
	Thumbnail string `json:"thumbnail"`
	Template  string `json:"template"`
	Starred   bool   `json:"starred"`
	Folder    string `json:"folder,omitempty"`
	Role      string `json:"role"`
	UpdatedAt string `json:"updatedAt"`
	CreatedAt string `json:"createdAt"`
}

type FileDetail struct {
	File FileMeta `json:"file"`
	Doc  any      `json:"doc"`
}

type Comment struct {
	ID        string  `json:"id"`
	FileID    string  `json:"fileId"`
	PageID    string  `json:"pageId"`
	NodeID    string  `json:"nodeId,omitempty"`
	ParentID  string  `json:"parentId,omitempty"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Text      string  `json:"text"`
	AuthorID  string  `json:"authorId"`
	Author    string  `json:"author"`
	Color     string  `json:"color"`
	Avatar    string  `json:"avatar,omitempty"`
	Resolved  bool    `json:"resolved"`
	CreatedAt string  `json:"createdAt"`
}

type VersionMeta struct {
	ID        string `json:"id"`
	FileID    string `json:"fileId"`
	Name      string `json:"name"`
	Version   int    `json:"version"`
	AuthorID  string `json:"authorId"`
	Author    string `json:"author"`
	CreatedAt string `json:"createdAt"`
}

type Member struct {
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Color     string `json:"color"`
	Avatar    string `json:"avatar,omitempty"`
	Role      string `json:"role"`
	CreatedAt string `json:"createdAt"`
}

func Now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

type Notification struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	FileID    string `json:"fileId"`
	FileName  string `json:"fileName"`
	CommentID string `json:"commentId"`
	ActorID   string `json:"actorId"`
	Actor     string `json:"actor"`
	Color     string `json:"color"`
	Avatar    string `json:"avatar,omitempty"`
	Text      string `json:"text"`
	Read      bool   `json:"read"`
	CreatedAt string `json:"createdAt"`
}
