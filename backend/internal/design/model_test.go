package design

import "testing"

func TestDesignOperations(t *testing.T) {
	doc, err := Parse(`{"pages":[{"id":"p1","name":"Page 1","nodes":{},"rootIds":[]}]}`)
	if err != nil {
		t.Fatal(err)
	}
	page := doc.Page("p1")
	frame := NewNode("frame", "Home", 20, 30, 390, 844)
	page.Add(frame, "", -1)
	if len(page.RootIDs) != 1 || frame.ParentID != nil {
		t.Fatalf("frame not added: %#v", page.RootIDs)
	}
	rect := NewNode("rect", "Card", 16, 40, 358, 200)
	page.Add(rect, frame.ID, -1)
	if rect.ParentID == nil || *rect.ParentID != frame.ID || len(frame.Children) != 1 {
		t.Fatalf("child not added: %#v %#v", rect.ParentID, frame.Children)
	}
	name := "Hero card"
	w := 400.0
	updated, ok := page.Update(rect.ID, Patch{Name: &name, Width: &w})
	if !ok || updated.Name != name || updated.Width != w {
		t.Fatalf("update failed: %#v", updated)
	}
	clone := page.Duplicate(rect.ID, 10, 10)
	if clone == nil || clone.ID == rect.ID || clone.X != rect.X+10 || len(frame.Children) != 2 {
		t.Fatalf("duplicate failed: %#v", clone)
	}
	page.Remove([]string{rect.ID}, doc.Tombstones, Now())
	if page.Node(rect.ID) != nil || doc.Tombstones[rect.ID] == 0 || len(frame.Children) != 1 {
		t.Fatalf("remove failed: %#v", doc.Tombstones)
	}
	summary := doc.Summary("p1")
	if summary["count"].(int) != 2 {
		t.Fatalf("unexpected summary: %#v", summary)
	}
}

func TestFindFrame(t *testing.T) {
	doc, _ := Parse(`{"pages":[{"id":"p1","name":"Page 1","nodes":{},"rootIds":[]},{"id":"p2","name":"Page 2","nodes":{},"rootIds":[]}]}`)
	f := NewNode("frame", "Checkout Screen", 0, 0, 390, 844)
	doc.Page("p2").Add(f, "", -1)
	p, n := doc.FindFrame("checkout")
	if p == nil || n == nil || n.ID != f.ID || p.ID != "p2" {
		t.Fatalf("frame lookup failed: %#v %#v", p, n)
	}
}

func TestLayoutAndConstraintPatch(t *testing.T) {
	d, _ := Parse(`{"pages":[{"id":"p1","name":"Page 1","nodes":{},"rootIds":[]}]}`)
	p := d.Page("p1")
	frame := NewNode("frame", "Auto", 0, 0, 320, 240)
	p.Add(frame, "", -1)
	layout, gap, padding := "vertical", 12.0, 16.0
	align := "center"
	hug := true
	ch, cv := "left-right", "top-bottom"
	updated, ok := p.Update(frame.ID, Patch{
		Layout: &layout, Gap: &gap, Padding: &padding, LayoutAlign: &align,
		LayoutHugHeight: &hug, ConstraintH: &ch, ConstraintV: &cv,
	})
	if !ok || updated.Layout != "vertical" || updated.Gap != 12 || updated.Padding != 16 ||
		updated.LayoutAlign != "center" || !updated.LayoutHugHeight ||
		updated.ConstraintH != "left-right" || updated.ConstraintV != "top-bottom" {
		t.Fatalf("layout patch not applied: %#v", updated)
	}
}
