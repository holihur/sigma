package doc

import (
	"encoding/json"
)

// Doc mirrors the document JSON shared with the frontend.
type Doc struct {
	Pages        []Page           `json:"pages"`
	Tombstones   map[string]int64 `json:"tombstones,omitempty"`
	DeletedPages map[string]int64 `json:"deletedPages,omitempty"`
}

type Page struct {
	ID      string                     `json:"id"`
	Name    string                     `json:"name"`
	Nodes   map[string]json.RawMessage `json:"nodes"`
	RootIDs []string                   `json:"rootIds"`
	TS      int64                      `json:"ts,omitempty"`
}

type nodeMeta struct {
	TS       int64    `json:"ts"`
	ParentID *string  `json:"parentId"`
	Children []string `json:"children"`
}


func cloneDoc(in *Doc) *Doc {
	out := &Doc{Pages: make([]Page, 0, len(in.Pages))}
	if in.Tombstones != nil {
		out.Tombstones = make(map[string]int64, len(in.Tombstones))
		for k, v := range in.Tombstones {
			out.Tombstones[k] = v
		}
	}
	if in.DeletedPages != nil {
		out.DeletedPages = make(map[string]int64, len(in.DeletedPages))
		for k, v := range in.DeletedPages {
			out.DeletedPages[k] = v
		}
	}
	for _, p := range in.Pages {
		np := Page{ID: p.ID, Name: p.Name, TS: p.TS, RootIDs: append([]string{}, p.RootIDs...),
			Nodes: make(map[string]json.RawMessage, len(p.Nodes))}
		for k, v := range p.Nodes {
			np.Nodes[k] = append(json.RawMessage{}, v...)
		}
		out.Pages = append(out.Pages, np)
	}
	return out
}

// Merge combines base and incoming using per-node last-writer-wins timestamps
// plus tombstones for deletions. It is commutative and idempotent enough for
// collaborative prototyping.
func Merge(base, incoming *Doc) *Doc {
	if base == nil {
		if incoming == nil {
			return &Doc{Pages: []Page{}, Tombstones: map[string]int64{}, DeletedPages: map[string]int64{}}
		}
		return cloneDoc(incoming)
	}
	if incoming == nil {
		return cloneDoc(base)
	}
	out := cloneDoc(base)
	if out.Tombstones == nil {
		out.Tombstones = map[string]int64{}
	}
	for id, ts := range incoming.Tombstones {
		if ts > out.Tombstones[id] {
			out.Tombstones[id] = ts
		}
	}
	if out.DeletedPages == nil {
		out.DeletedPages = map[string]int64{}
	}
	for id, ts := range incoming.DeletedPages {
		if ts > out.DeletedPages[id] {
			out.DeletedPages[id] = ts
		}
	}

	pageIndex := map[string]int{}
	for i, p := range out.Pages {
		pageIndex[p.ID] = i
	}
	for _, ip := range incoming.Pages {
		idx, ok := pageIndex[ip.ID]
		if !ok {
			np := Page{ID: ip.ID, Name: ip.Name, TS: ip.TS, RootIDs: append([]string{}, ip.RootIDs...),
				Nodes: make(map[string]json.RawMessage, len(ip.Nodes))}
			for k, v := range ip.Nodes {
				np.Nodes[k] = append(json.RawMessage{}, v...)
			}
			out.Pages = append(out.Pages, np)
			pageIndex[ip.ID] = len(out.Pages) - 1
			continue
		}
		bp := &out.Pages[idx]
		// Page metadata (name, order) is last-writer-wins on page ts.
		if ip.TS > bp.TS {
			bp.Name = ip.Name
			bp.TS = ip.TS
			bp.RootIDs = append([]string{}, ip.RootIDs...)
		}
		for id, raw := range ip.Nodes {
			if existing, ok := bp.Nodes[id]; ok {
				var em, im nodeMeta
				_ = json.Unmarshal(existing, &em)
				_ = json.Unmarshal(raw, &im)
				if im.TS >= em.TS {
					bp.Nodes[id] = append(json.RawMessage{}, raw...)
				}
			} else {
				bp.Nodes[id] = append(json.RawMessage{}, raw...)
			}
		}
	}

	// Drop pages that were deleted (unless re-added with a newer timestamp).
	livePages := out.Pages[:0]
	for _, p := range out.Pages {
		if ts, dead := out.DeletedPages[p.ID]; dead && ts >= p.TS {
			continue
		}
		livePages = append(livePages, p)
	}
	out.Pages = livePages

	// Apply tombstones and repair references.
	for i := range out.Pages {
		p := &out.Pages[i]
		for id := range p.Nodes {
			if ts, dead := out.Tombstones[id]; dead {
				var m nodeMeta
				_ = json.Unmarshal(p.Nodes[id], &m)
				if ts >= m.TS {
					delete(p.Nodes, id)
				}
			}
		}
		// Deduplicate roots and append orphan nodes that are not roots.
		seen := map[string]bool{}
		roots := make([]string, 0, len(p.RootIDs))
		for _, id := range p.RootIDs {
			if seen[id] {
				continue
			}
			if _, ok := p.Nodes[id]; !ok {
				continue
			}
			seen[id] = true
			roots = append(roots, id)
		}
		// Keep deterministic order: nodes present in root IDs first, then any
		// remaining parentless nodes sorted by ts then id.
		type orphan struct {
			id string
			ts int64
		}
		orphans := []orphan{}
		for id, raw := range p.Nodes {
			if seen[id] {
				continue
			}
			var m nodeMeta
			_ = json.Unmarshal(raw, &m)
			if m.ParentID == nil {
				orphans = append(orphans, orphan{id: id, ts: m.TS})
			}
		}
		// Stable insertion sort.
		for i := 1; i < len(orphans); i++ {
			for j := i; j > 0; j-- {
				if orphans[j].ts < orphans[j-1].ts || (orphans[j].ts == orphans[j-1].ts && orphans[j].id < orphans[j-1].id) {
					orphans[j], orphans[j-1] = orphans[j-1], orphans[j]
				}
			}
		}
		for _, o := range orphans {
			roots = append(roots, o.id)
			seen[o.id] = true
		}
		p.RootIDs = roots

		// Drop child references that no longer exist.
		for id, raw := range p.Nodes {
			var m nodeMeta
			if err := json.Unmarshal(raw, &m); err != nil || m.Children == nil {
				continue
			}
			changed := false
			kids := m.Children[:0]
			for _, kid := range m.Children {
				if _, ok := p.Nodes[kid]; ok {
					kids = append(kids, kid)
				} else {
					changed = true
				}
			}
			if changed {
				m.Children = kids
				if b, err := json.Marshal(m); err == nil {
					p.Nodes[id] = b
				}
			}
		}
	}
	return out
}


// PrepareRestore makes a restored snapshot authoritative: every node and page
// gets a fresh timestamp, nodes that exist now but not in the snapshot are
// tombstoned, and missing pages are tombstoned. This prevents a later LWW merge
// from resurrecting old content.
func PrepareRestore(current, restored *Doc, now int64) *Doc {
	out := cloneDoc(restored)
	out.Tombstones = map[string]int64{}
	for k, v := range restored.Tombstones {
		out.Tombstones[k] = v
	}
	out.DeletedPages = map[string]int64{}
	for k, v := range restored.DeletedPages {
		out.DeletedPages[k] = v
	}
	livePages := map[string]*Page{}
	for i := range out.Pages {
		p := &out.Pages[i]
		p.TS = now
		livePages[p.ID] = p
		for id, raw := range p.Nodes {
			var m map[string]any
			if err := json.Unmarshal(raw, &m); err != nil {
				continue
			}
			m["ts"] = now
			if b, err := json.Marshal(m); err == nil {
				p.Nodes[id] = b
			}
		}
	}
	for _, cp := range current.Pages {
		rp, ok := livePages[cp.ID]
		if !ok {
			out.DeletedPages[cp.ID] = now
			continue
		}
		for id := range cp.Nodes {
			if _, ok := rp.Nodes[id]; !ok {
				out.Tombstones[id] = now
			}
		}
	}
	return out
}


// ApplyDelta merges a partial document (only changed pages/nodes plus
// tombstones) into the stored document.
func ApplyDelta(current, delta *Doc) *Doc {
	return Merge(current, delta)
}

// DeltaResult returns the authoritative subset of merged state corresponding to
// the pages touched by delta. It is broadcast to clients instead of the full
// document, keeping collaborative updates small.
func DeltaResult(merged, delta *Doc) *Doc {
	out := &Doc{
		Pages:        []Page{},
		Tombstones:   map[string]int64{},
		DeletedPages: map[string]int64{},
	}
	mergedPages := map[string]*Page{}
	for i := range merged.Pages {
		mergedPages[merged.Pages[i].ID] = &merged.Pages[i]
	}
	for _, dp := range delta.Pages {
		mp := mergedPages[dp.ID]
		if mp == nil {
			continue
		}
		np := Page{
			ID:      mp.ID,
			Name:    mp.Name,
			TS:      mp.TS,
			RootIDs: append([]string{}, mp.RootIDs...),
			Nodes:   make(map[string]json.RawMessage, len(dp.Nodes)),
		}
		for id := range dp.Nodes {
			if raw, ok := mp.Nodes[id]; ok {
				np.Nodes[id] = append(json.RawMessage{}, raw...)
			}
		}
		out.Pages = append(out.Pages, np)
	}
	for id := range delta.Tombstones {
		if ts, ok := merged.Tombstones[id]; ok {
			out.Tombstones[id] = ts
		}
	}
	for id := range delta.DeletedPages {
		if ts, ok := merged.DeletedPages[id]; ok {
			out.DeletedPages[id] = ts
		}
	}
	return out
}

func IsEmptyDelta(d *Doc) bool {
	return len(d.Pages) == 0 && len(d.Tombstones) == 0 && len(d.DeletedPages) == 0
}
