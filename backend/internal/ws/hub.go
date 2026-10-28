package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type User struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Role  string `json:"role"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Presence struct {
	ClientID  string   `json:"clientId"`
	UserID    string   `json:"userId"`
	Name      string   `json:"name"`
	Color     string   `json:"color"`
	Role      string   `json:"role"`
	Cursor    *Point   `json:"cursor,omitempty"`
	Selection []string `json:"selection,omitempty"`
}

type AccessFunc func(fileID, token string) (User, error)
type DocFunc func(fileID, userID string, incoming json.RawMessage) (json.RawMessage, int, error)
type DeltaFunc func(fileID, userID string, incoming json.RawMessage) (json.RawMessage, int, error)

type Hub struct {
	access AccessFunc
	save   DocFunc
	delta  DeltaFunc
	rooms  map[string]*room
	mu     sync.Mutex
}

type room struct {
	clients map[*client]struct{}
}

type client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	fileID   string
	clientID string
	user     User
	presence Presence
	closeMu  sync.Once
}

type inbound struct {
	Type      string          `json:"type"`
	Cursor    *Point          `json:"cursor,omitempty"`
	Selection []string        `json:"selection,omitempty"`
	Doc       json.RawMessage `json:"doc,omitempty"`
	Delta     json.RawMessage `json:"delta,omitempty"`
}

type outbound struct {
	Type    string     `json:"type"`
	Doc     any        `json:"doc,omitempty"`
	Delta   any        `json:"delta,omitempty"`
	Comment any        `json:"comment,omitempty"`
	Version int        `json:"version,omitempty"`
	Users   []Presence `json:"users,omitempty"`
	Self    *Presence  `json:"self,omitempty"`
	Message string     `json:"message,omitempty"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // same-origin / non-browser clients
		}
		allowed := r.Header.Get("X-Requested-With") // placeholder to avoid unused
		_ = allowed
		base := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
		if base != "" {
			if u, err := parseOrigin(base); err == nil && u == origin {
				return true
			}
		}
		allowedList := strings.TrimSpace(os.Getenv("APP_ALLOWED_ORIGINS"))
		if allowedList != "" && allowedList != "*" {
			for _, o := range strings.Split(allowedList, ",") {
				if strings.TrimSpace(o) == origin {
					return true
				}
			}
			return false
		}
		// Dev fallback: allow localhost
		return strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") || strings.HasPrefix(origin, "https://localhost")
	},
}

func NewHub(access AccessFunc, save DocFunc, delta DeltaFunc) *Hub {
	return &Hub{access: access, save: save, delta: delta, rooms: map[string]*room{}}
}

func (h *Hub) Handle(w http.ResponseWriter, r *http.Request) {
	fileID := r.URL.Query().Get("fileId")
	token := r.URL.Query().Get("token")
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = "anon"
	}
	if fileID == "" {
		http.Error(w, "missing fileId", http.StatusBadRequest)
		return
	}
	user, err := h.access(fileID, token)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{
		hub: h, conn: conn, send: make(chan []byte, 256), fileID: fileID,
		clientID: clientID, user: user,
		presence: Presence{ClientID: clientID, UserID: user.ID, Name: user.Name, Color: user.Color, Role: user.Role},
	}
	h.join(c)
	go c.writePump()
	h.broadcastPresence(fileID)
	c.readPump()
}

func (h *Hub) room(fileID string) *room {
	r, ok := h.rooms[fileID]
	if !ok {
		r = &room{clients: map[*client]struct{}{}}
		h.rooms[fileID] = r
	}
	return r
}

func (h *Hub) join(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.room(c.fileID).clients[c] = struct{}{}
	users := h.presenceLocked(c.fileID)
	payload, _ := json.Marshal(outbound{Type: "welcome", Users: users, Self: &c.presence})
	c.enqueue(payload)
}

func (h *Hub) remove(c *client) {
	h.mu.Lock()
	if r, ok := h.rooms[c.fileID]; ok {
		delete(r.clients, c)
		if len(r.clients) == 0 {
			delete(h.rooms, c.fileID)
		}
	}
	h.mu.Unlock()
	h.broadcastPresence(c.fileID)
}

func (h *Hub) presenceLocked(fileID string) []Presence {
	r := h.rooms[fileID]
	out := []Presence{}
	if r == nil {
		return out
	}
	for c := range r.clients {
		out = append(out, c.presence)
	}
	return out
}

func (h *Hub) broadcastPresence(fileID string) {
	h.mu.Lock()
	users := h.presenceLocked(fileID)
	payload, _ := json.Marshal(outbound{Type: "presence", Users: users})
	r := h.rooms[fileID]
	clients := make([]*client, 0, len(r.clients))
	if r != nil {
		for c := range r.clients {
			clients = append(clients, c)
		}
	}
	h.mu.Unlock()
	for _, c := range clients {
		c.enqueue(payload)
	}
}

// BroadcastDoc lets the HTTP API push an authoritative document to a room.
func (h *Hub) BroadcastDoc(fileID string, doc json.RawMessage, version int) {
	h.broadcastDoc(fileID, doc, version)
}

// BroadcastComment sends a newly created comment to everyone in the file room.
func (h *Hub) BroadcastComment(fileID string, comment any) {
	h.mu.Lock()
	r := h.rooms[fileID]
	if r == nil {
		h.mu.Unlock()
		return
	}
	payload, err := json.Marshal(outbound{Type: "comment", Comment: comment})
	clients := make([]*client, 0, len(r.clients))
	for c := range r.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	if err != nil {
		return
	}
	for _, c := range clients {
		c.enqueue(payload)
	}
}

func (h *Hub) broadcastDelta(fileID string, delta json.RawMessage, version int) {
	h.mu.Lock()
	r := h.rooms[fileID]
	if r == nil {
		h.mu.Unlock()
		return
	}
	payload, err := json.Marshal(outbound{Type: "doc-delta", Delta: delta, Version: version})
	clients := make([]*client, 0, len(r.clients))
	for c := range r.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	if err != nil {
		return
	}
	for _, c := range clients {
		c.enqueue(payload)
	}
}

func (h *Hub) broadcastDoc(fileID string, doc json.RawMessage, version int) {
	h.mu.Lock()
	r := h.rooms[fileID]
	if r == nil {
		h.mu.Unlock()
		return
	}
	payload, err := json.Marshal(outbound{Type: "doc", Doc: doc, Version: version})
	clients := make([]*client, 0, len(r.clients))
	for c := range r.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	if err != nil {
		return
	}
	for _, c := range clients {
		c.enqueue(payload)
	}
}

func (c *client) enqueue(payload []byte) {
	select {
	case c.send <- payload:
	default:
		// Slow consumer: drop the update rather than blocking the hub.
		log.Printf("ws: dropping message for slow client %s", c.clientID)
	}
}

func (c *client) close() {
	c.closeMu.Do(func() {
		close(c.send)
		c.conn.Close()
		c.hub.remove(c)
	})
}

func parseOrigin(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		parts := strings.SplitN(raw, "/", 4)
		if len(parts) >= 3 {
			return parts[0] + "//" + parts[2], nil
		}
	}
	return raw, nil
}

func (c *client) readPump() {
	defer c.close()
	c.conn.SetReadLimit(2 << 20)
	_ = c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg inbound
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "presence":
			if msg.Cursor != nil {
				c.presence.Cursor = msg.Cursor
			}
			c.presence.Selection = msg.Selection
			c.hub.broadcastPresence(c.fileID)
		case "doc":
			if c.user.Role != "owner" && c.user.Role != "edit" {
				continue
			}
			if len(msg.Doc) == 0 {
				continue
			}
			merged, version, err := c.hub.save(c.fileID, c.user.ID, msg.Doc)
			if err != nil {
				log.Printf("ws save %s: %v", c.fileID, err)
				errPayload, _ := json.Marshal(outbound{Type: "error", Message: "Could not save changes"})
				c.enqueue(errPayload)
				continue
			}
			c.hub.broadcastDoc(c.fileID, merged, version)
		case "delta":
			if c.user.Role != "owner" && c.user.Role != "edit" {
				continue
			}
			if len(msg.Delta) == 0 {
				continue
			}
			applied, version, err := c.hub.delta(c.fileID, c.user.ID, msg.Delta)
			if err != nil {
				log.Printf("ws delta %s: %v", c.fileID, err)
				errPayload, _ := json.Marshal(outbound{Type: "error", Message: "Could not save changes"})
				c.enqueue(errPayload)
				continue
			}
			c.hub.broadcastDelta(c.fileID, applied, version)
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
