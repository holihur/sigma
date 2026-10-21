package doc

import (
	"encoding/json"
	"testing"
)

func parseDoc(t *testing.T, raw string) *Doc {
	t.Helper()
	var d Doc
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatalf("parse doc: %v", err)
	}
	return &d
}

func node(t *testing.T, d *Doc, pageID, nodeID string) map[string]any {
	t.Helper()
	for _, p := range d.Pages {
		if p.ID != pageID {
			continue
		}
		raw, ok := p.Nodes[nodeID]
		if !ok {
			return nil
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("parse node: %v", err)
		}
		return m
	}
	return nil
}

func TestMergeUsesNewestNode(t *testing.T) {
	base := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["n1"],"nodes":{
		"n1":{"id":"n1","name":"Old","ts":10,"parentId":null}
	}}]}`)
	incoming := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["n1"],"nodes":{
		"n1":{"id":"n1","name":"New","ts":20,"parentId":null}
	}}]}`)
	merged := Merge(base, incoming)
	n := node(t, merged, "p1", "n1")
	if n == nil || n["name"] != "New" {
		t.Fatalf("expected newest node, got %#v", n)
	}
}

func TestMergeKeepsConcurrentNodes(t *testing.T) {
	base := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["a"],"nodes":{
		"a":{"id":"a","name":"A","ts":10,"parentId":null}
	}}]}`)
	incoming := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["a","b"],"nodes":{
		"b":{"id":"b","name":"B","ts":20,"parentId":null}
	}}]}`)
	merged := Merge(base, incoming)
	if node(t, merged, "p1", "a") == nil || node(t, merged, "p1", "b") == nil {
		t.Fatalf("expected both nodes, got %#v", merged.Pages[0].Nodes)
	}
	if len(merged.Pages[0].RootIDs) != 2 {
		t.Fatalf("expected both roots, got %#v", merged.Pages[0].RootIDs)
	}
}

func TestTombstoneDeletesOnlyOlderNode(t *testing.T) {
	base := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":1,"rootIds":["old","new"],"nodes":{
		"old":{"id":"old","name":"Old","ts":10,"parentId":null},
		"new":{"id":"new","name":"New","ts":30,"parentId":null}
	}}]}`)
	incoming := parseDoc(t, `{"pages":[],"tombstones":{"old":20,"new":20}}`)
	merged := Merge(base, incoming)
	if node(t, merged, "p1", "old") != nil {
		t.Fatal("tombstoned older node should be removed")
	}
	if node(t, merged, "p1", "new") == nil {
		t.Fatal("newer node should survive an older tombstone")
	}
}

func TestDeletedPageTombstone(t *testing.T) {
	base := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":10,"rootIds":[],"nodes":{}}]}`)
	incoming := parseDoc(t, `{"pages":[],"deletedPages":{"p1":20}}`)
	merged := Merge(base, incoming)
	if len(merged.Pages) != 0 {
		t.Fatalf("expected page deletion, got %d pages", len(merged.Pages))
	}

	revived := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1 again","ts":30,"rootIds":[],"nodes":{}}],"deletedPages":{"p1":20}}`)
	merged = Merge(base, revived)
	if len(merged.Pages) != 1 || merged.Pages[0].Name != "Page 1 again" {
		t.Fatalf("expected revived page, got %#v", merged.Pages)
	}
}

func TestPrepareRestoreMakesSnapshotAuthoritative(t *testing.T) {
	current := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":10,"rootIds":["a","b","gone"],"nodes":{
		"a":{"id":"a","name":"A","ts":10,"parentId":null},
		"b":{"id":"b","name":"B changed","ts":20,"parentId":null},
		"gone":{"id":"gone","name":"Gone","ts":20,"parentId":null}
	}},{"id":"p2","name":"Page 2","ts":10,"rootIds":[],"nodes":{}}]}`)
	restored := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":5,"rootIds":["a","b"],"nodes":{
		"a":{"id":"a","name":"A","ts":5,"parentId":null},
		"b":{"id":"b","name":"B restored","ts":5,"parentId":null}
	}}]}`)
	now := int64(1000)
	prepared := PrepareRestore(current, restored, now)
	if node(t, prepared, "p1", "gone") != nil {
		t.Fatal("node missing from restore should not exist")
	}
	if ts, ok := prepared.Tombstones["gone"]; !ok || ts != now {
		t.Fatalf("expected tombstone for removed node, got %#v", prepared.Tombstones)
	}
	if ts, ok := prepared.DeletedPages["p2"]; !ok || ts != now {
		t.Fatalf("expected tombstone for removed page, got %#v", prepared.DeletedPages)
	}
	a := node(t, prepared, "p1", "a")
	if a == nil || a["ts"].(float64) != float64(now) {
		t.Fatalf("expected refreshed node ts, got %#v", a)
	}
	b := node(t, prepared, "p1", "b")
	if b == nil || b["name"] != "B restored" {
		t.Fatalf("expected restored content, got %#v", b)
	}
	if prepared.Pages[0].TS != now {
		t.Fatalf("expected refreshed page ts, got %d", prepared.Pages[0].TS)
	}
}

func TestDeltaApplyAndAuthoritativeResult(t *testing.T) {
	current := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":10,"rootIds":["a","b"],"nodes":{
		"a":{"id":"a","name":"Base A","ts":30,"parentId":null},
		"b":{"id":"b","name":"Base B","ts":10,"parentId":null}
	}}]}`)
	delta := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":10,"rootIds":["a","b","c"],"nodes":{
		"a":{"id":"a","name":"Stale A","ts":20,"parentId":null},
		"c":{"id":"c","name":"New C","ts":40,"parentId":null}
	}}],"tombstones":{"b":40}}`)
	merged := ApplyDelta(current, delta)
	applied := DeltaResult(merged, delta)
	if node(t, applied, "p1", "c") == nil {
		t.Fatal("expected new node in delta result")
	}
	if ts, ok := applied.Tombstones["b"]; !ok || ts != 40 {
		t.Fatalf("expected tombstone for b, got %#v", applied.Tombstones)
	}
	a := node(t, applied, "p1", "a")
	if a == nil || a["name"] != "Base A" {
		t.Fatalf("expected authoritative newer node, got %#v", a)
	}
	if len(applied.Pages[0].RootIDs) != 2 || applied.Pages[0].RootIDs[0] != "a" || applied.Pages[0].RootIDs[1] != "c" {
		t.Fatalf("expected merged root order, got %#v", applied.Pages[0].RootIDs)
	}
}

func TestDeltaPageRemovalResult(t *testing.T) {
	current := parseDoc(t, `{"pages":[{"id":"p1","name":"Page 1","ts":10,"rootIds":[],"nodes":{}}]}`)
	delta := parseDoc(t, `{"pages":[],"deletedPages":{"p1":50}}`)
	merged := ApplyDelta(current, delta)
	if len(merged.Pages) != 0 {
		t.Fatal("expected deleted page")
	}
	applied := DeltaResult(merged, delta)
	if ts, ok := applied.DeletedPages["p1"]; !ok || ts != 50 {
		t.Fatalf("expected deleted page in delta result, got %#v", applied.DeletedPages)
	}
}
