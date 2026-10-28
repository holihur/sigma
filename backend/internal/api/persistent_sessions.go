package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"google.golang.org/adk/session"
)

// persistentSessions keeps ADK conversations across restarts. It wraps the
// in-memory implementation and snapshots sessions to disk after every event.
// Snapshot failures are non-fatal: an AI reply must not fail because the cache
// directory is temporarily unavailable.
type persistentSessions struct {
	base session.Service
	dir  string
	mu   sync.Mutex
}

type sessionSnapshot struct {
	AppName   string           `json:"appName"`
	UserID    string           `json:"userId"`
	SessionID string           `json:"sessionId"`
	State     map[string]any   `json:"state"`
	Events    []*session.Event `json:"events"`
	UpdatedAt time.Time        `json:"updatedAt"`
}

func newPersistentSessions(dir string) session.Service {
	if dir == "" {
		return session.InMemoryService()
	}
	_ = os.MkdirAll(dir, 0o700)
	return &persistentSessions{base: session.InMemoryService(), dir: dir}
}

func (p *persistentSessions) path(appName, userID, sessionID string) string {
	sum := sha256.Sum256([]byte(appName + "\x00" + userID + "\x00" + sessionID))
	return filepath.Join(p.dir, hex.EncodeToString(sum[:])+".json")
}

func snapshotSession(s session.Session) sessionSnapshot {
	snap := sessionSnapshot{AppName: s.AppName(), UserID: s.UserID(), SessionID: s.ID(), State: map[string]any{}, UpdatedAt: s.LastUpdateTime()}
	for k, v := range s.State().All() {
		snap.State[k] = v
	}
	for ev := range s.Events().All() {
		snap.Events = append(snap.Events, ev)
	}
	return snap
}

func (p *persistentSessions) save(s session.Session) {
	snap := snapshotSession(s)
	raw, err := json.Marshal(snap)
	if err != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	tmp := p.path(s.AppName(), s.UserID(), s.ID()) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return
	}
	_ = os.Rename(tmp, p.path(s.AppName(), s.UserID(), s.ID()))
}

func (p *persistentSessions) restore(ctx context.Context, req *session.GetRequest) (session.Session, error) {
	raw, err := os.ReadFile(p.path(req.AppName, req.UserID, req.SessionID))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", session.ErrNotFound, err)
	}
	var snap sessionSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		return nil, fmt.Errorf("%w: %v", session.ErrNotFound, err)
	}
	created, err := p.base.Create(ctx, &session.CreateRequest{AppName: req.AppName, UserID: req.UserID, SessionID: req.SessionID, State: snap.State})
	if err != nil {
		return nil, err
	}
	for _, ev := range snap.Events {
		if err := p.base.AppendEvent(ctx, created.Session, ev); err != nil {
			return nil, err
		}
	}
	return p.base.Get(ctx, &session.GetRequest{AppName: req.AppName, UserID: req.UserID, SessionID: req.SessionID, NumRecentEvents: req.NumRecentEvents, After: req.After})
}

func (p *persistentSessions) Create(ctx context.Context, req *session.CreateRequest) (*session.CreateResponse, error) {
	res, err := p.base.Create(ctx, req)
	if err != nil {
		return nil, err
	}
	p.save(res.Session)
	return res, nil
}

func (p *persistentSessions) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	res, err := p.base.Get(ctx, req)
	if err == nil {
		return res, nil
	}
	if !errors.Is(err, session.ErrNotFound) {
		return nil, err
	}
	restored, rerr := p.restore(ctx, req)
	if rerr != nil {
		return nil, err
	}
	p.save(restored)
	return &session.GetResponse{Session: restored}, nil
}

func (p *persistentSessions) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	entries, _ := os.ReadDir(p.dir)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(p.dir, entry.Name()))
		if err != nil {
			continue
		}
		var snap sessionSnapshot
		if json.Unmarshal(raw, &snap) != nil || snap.AppName != req.AppName || snap.UserID != req.UserID {
			continue
		}
		_, _ = p.Get(ctx, &session.GetRequest{AppName: snap.AppName, UserID: snap.UserID, SessionID: snap.SessionID})
	}
	return p.base.List(ctx, req)
}

func (p *persistentSessions) Delete(ctx context.Context, req *session.DeleteRequest) error {
	err := p.base.Delete(ctx, req)
	_ = os.Remove(p.path(req.AppName, req.UserID, req.SessionID))
	return err
}

func (p *persistentSessions) AppendEvent(ctx context.Context, s session.Session, ev *session.Event) error {
	if err := p.base.AppendEvent(ctx, s, ev); err != nil {
		return err
	}
	updated, err := p.base.Get(ctx, &session.GetRequest{AppName: s.AppName(), UserID: s.UserID(), SessionID: s.ID()})
	if err == nil {
		p.save(updated.Session)
	}
	return nil
}
