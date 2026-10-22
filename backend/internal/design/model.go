package design

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

type Stop struct {
	Color    string  `json:"color"`
	Position float64 `json:"position"`
}

type Paint struct {
	Type    string  `json:"type"`
	Color   string  `json:"color,omitempty"`
	Opacity float64 `json:"opacity,omitempty"`
	Angle   float64 `json:"angle,omitempty"`
	Stops   []Stop  `json:"stops,omitempty"`
}

type Shadow struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Blur   float64 `json:"blur"`
	Spread float64 `json:"spread"`
	Color  string  `json:"color"`
}

type VectorHandle struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type VectorPoint struct {
	X   float64       `json:"x"`
	Y   float64       `json:"y"`
	In  *VectorHandle `json:"in,omitempty"`
	Out *VectorHandle `json:"out,omitempty"`
}

type Link struct {
	Action        string `json:"action"`
	TargetPageID  string `json:"targetPageId,omitempty"`
	TargetFrameID string `json:"targetFrameId,omitempty"`
	URL           string `json:"url,omitempty"`
	Transition    string `json:"transition"`
}

type Node struct {
	ID            string        `json:"id"`
	Type          string        `json:"type"`
	Name          string        `json:"name"`
	X             float64       `json:"x"`
	Y             float64       `json:"y"`
	Width         float64       `json:"width"`
	Height        float64       `json:"height"`
	Rotation      float64       `json:"rotation"`
	Opacity       float64       `json:"opacity"`
	Visible       bool          `json:"visible"`
	Locked        bool          `json:"locked"`
	Fill          *Paint        `json:"fill"`
	Stroke        *Paint        `json:"stroke"`
	StrokeWidth   float64       `json:"strokeWidth"`
	Radius        float64       `json:"radius"`
	Shadow        *Shadow       `json:"shadow"`
	Blur          float64       `json:"blur"`
	Children      []string      `json:"children"`
	ParentID      *string       `json:"parentId"`
	Clip          bool          `json:"clip"`
	Text          string        `json:"text"`
	FontSize      float64       `json:"fontSize"`
	FontFamily    string        `json:"fontFamily"`
	FontWeight    int           `json:"fontWeight"`
	LineHeight    float64       `json:"lineHeight"`
	LetterSpacing float64       `json:"letterSpacing"`
	TextAlign     string        `json:"textAlign"`
	VerticalAlign string        `json:"verticalAlign"`
	Src           string        `json:"src"`
	ObjectFit     string        `json:"objectFit"`
	Link          *Link         `json:"link"`
	Points        []VectorPoint `json:"points,omitempty"`
	Closed        bool          `json:"closed,omitempty"`
	Component     bool          `json:"component,omitempty"`
	ComponentID   string        `json:"componentId,omitempty"`
	TS            int64         `json:"ts"`
}

type Page struct {
	ID      string           `json:"id"`
	Name    string           `json:"name"`
	Nodes   map[string]*Node `json:"nodes"`
	RootIDs []string         `json:"rootIds"`
	TS      int64            `json:"ts,omitempty"`
}

type Doc struct {
	Pages        []*Page          `json:"pages"`
	Tombstones   map[string]int64 `json:"tombstones,omitempty"`
	DeletedPages map[string]int64 `json:"deletedPages,omitempty"`
}

func Parse(raw string) (*Doc, error) {
	var d Doc
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return nil, err
	}
	if d.Tombstones == nil {
		d.Tombstones = map[string]int64{}
	}
	if d.DeletedPages == nil {
		d.DeletedPages = map[string]int64{}
	}
	for _, p := range d.Pages {
		if p.Nodes == nil {
			p.Nodes = map[string]*Node{}
		}
		if p.RootIDs == nil {
			p.RootIDs = []string{}
		}
		for _, n := range p.Nodes {
			if n.Children == nil {
				n.Children = []string{}
			}
		}
	}
	return &d, nil
}

func (d *Doc) Marshal() ([]byte, error) { return json.Marshal(d) }

func (d *Doc) Page(id string) *Page {
	if len(d.Pages) == 0 {
		return nil
	}
	if id == "" {
		return d.Pages[0]
	}
	for _, p := range d.Pages {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (p *Page) Node(id string) *Node { return p.Nodes[id] }

func NewID(prefix string) string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

func Now() int64 { return time.Now().UnixMilli() }

func Solid(color string) *Paint { return &Paint{Type: "solid", Color: color} }

func NewNode(typ, name string, x, y, width, height float64) *Node {
	if width < 1 {
		width = 1
	}
	if height < 0 {
		height = 0
	}
	n := &Node{
		ID: NewID("n"), Type: typ, Name: name,
		X: x, Y: y, Width: width, Height: height,
		Rotation: 0, Opacity: 1, Visible: true, Locked: false,
		StrokeWidth: 1, Children: []string{},
		FontSize: 16, FontFamily: "Inter Variable", FontWeight: 400,
		LineHeight: 1.4, LetterSpacing: 0,
		TextAlign: "left", VerticalAlign: "top",
		ObjectFit: "cover", TS: Now(),
	}
	switch typ {
	case "frame":
		n.Fill = Solid("#ffffff")
		n.Clip = true
		if n.Name == "" {
			n.Name = "Frame"
		}
	case "rect":
		n.Fill = Solid("#0ea5e9")
		if n.Name == "" {
			n.Name = "Rectangle"
		}
	case "ellipse":
		n.Fill = Solid("#f97316")
		n.Radius = 9999
		if n.Name == "" {
			n.Name = "Ellipse"
		}
	case "text":
		n.Fill = Solid("#111827")
		n.FontSize = 24
		n.Width = 320
		n.Height = 40
		n.Text = "Text"
		if n.Name == "" {
			n.Name = "Text"
		}
	case "line":
		n.Fill = nil
		n.Stroke = Solid("#111827")
		n.StrokeWidth = 2
		n.Height = 0
		if n.Name == "" {
			n.Name = "Line"
		}
	case "vector":
		n.Fill = nil
		n.Stroke = Solid("#0ea5e9")
		n.StrokeWidth = 2
		n.Width = 1
		n.Height = 1
		if n.Name == "" {
			n.Name = "Vector"
		}
	default:
		if n.Name == "" {
			n.Name = typ
		}
	}
	return n
}

func (p *Page) Add(node *Node, parentID string, index int) {
	now := Now()
	node.TS = now
	if parentID != "" {
		if parent := p.Nodes[parentID]; parent != nil {
			node.ParentID = &parentID
			if index < 0 || index > len(parent.Children) {
				index = len(parent.Children)
			}
			parent.Children = insertAt(parent.Children, index, node.ID)
			parent.TS = now
			p.Nodes[node.ID] = node
			p.TS = now
			return
		}
	}
	node.ParentID = nil
	if index < 0 || index > len(p.RootIDs) {
		index = len(p.RootIDs)
	}
	p.RootIDs = insertAt(p.RootIDs, index, node.ID)
	p.Nodes[node.ID] = node
	p.TS = now
}

func (p *Page) Remove(ids []string, tombstones map[string]int64, now int64) {
	seen := map[string]bool{}
	var remove func(string)
	remove = func(id string) {
		if seen[id] {
			return
		}
		seen[id] = true
		n := p.Nodes[id]
		if n == nil {
			return
		}
		for _, child := range append([]string{}, n.Children...) {
			remove(child)
		}
		if n.ParentID != nil {
			if parent := p.Nodes[*n.ParentID]; parent != nil {
				parent.Children = removeString(parent.Children, id)
				parent.TS = now
			}
		}
		p.RootIDs = removeString(p.RootIDs, id)
		delete(p.Nodes, id)
		if tombstones != nil {
			tombstones[id] = now
		}
	}
	for _, id := range ids {
		remove(id)
	}
	p.TS = now
}

type Patch struct {
	Name          *string
	X             *float64
	Y             *float64
	Width         *float64
	Height        *float64
	Rotation      *float64
	Opacity       *float64
	Radius        *float64
	Fill          *string
	Stroke        *string
	StrokeWidth   *float64
	Text          *string
	FontSize      *float64
	FontWeight    *int
	LineHeight    *float64
	LetterSpacing *float64
	TextAlign     *string
	Visible       *bool
	Points        *[]VectorPoint
	Closed        *bool
	Component     *bool
	ComponentID   *string
}

func (p *Page) Update(id string, patch Patch) (*Node, bool) {
	n := p.Nodes[id]
	if n == nil {
		return nil, false
	}
	now := Now()
	if patch.Name != nil && *patch.Name != "" {
		n.Name = *patch.Name
	}
	if patch.X != nil {
		n.X = *patch.X
	}
	if patch.Y != nil {
		n.Y = *patch.Y
	}
	if patch.Width != nil {
		n.Width = max(1, *patch.Width)
	}
	if patch.Height != nil {
		n.Height = max(0, *patch.Height)
	}
	if patch.Rotation != nil {
		n.Rotation = *patch.Rotation
	}
	if patch.Opacity != nil {
		n.Opacity = clamp(*patch.Opacity, 0, 1)
	}
	if patch.Radius != nil {
		n.Radius = max(0, *patch.Radius)
	}
	if patch.Fill != nil {
		n.Fill = Solid(*patch.Fill)
	}
	if patch.Stroke != nil {
		n.Stroke = Solid(*patch.Stroke)
	}
	if patch.StrokeWidth != nil {
		n.StrokeWidth = max(0, *patch.StrokeWidth)
	}
	if patch.Text != nil {
		n.Text = *patch.Text
	}
	if patch.FontSize != nil {
		n.FontSize = max(1, *patch.FontSize)
	}
	if patch.FontWeight != nil {
		n.FontWeight = *patch.FontWeight
	}
	if patch.LineHeight != nil {
		n.LineHeight = *patch.LineHeight
	}
	if patch.LetterSpacing != nil {
		n.LetterSpacing = *patch.LetterSpacing
	}
	if patch.TextAlign != nil && (*patch.TextAlign == "left" || *patch.TextAlign == "center" || *patch.TextAlign == "right") {
		n.TextAlign = *patch.TextAlign
	}
	if patch.Visible != nil {
		n.Visible = *patch.Visible
	}
	if patch.Points != nil {
		n.Points = *patch.Points
	}
	if patch.Closed != nil {
		n.Closed = *patch.Closed
	}
	if patch.Component != nil {
		n.Component = *patch.Component
	}
	if patch.ComponentID != nil {
		n.ComponentID = *patch.ComponentID
	}
	n.TS = now
	p.TS = now
	return n, true
}

func (p *Page) Duplicate(id string, dx, dy float64) *Node {
	original := p.Nodes[id]
	if original == nil {
		return nil
	}
	now := Now()
	var clone func(*Node, *string) *Node
	clone = func(src *Node, parentID *string) *Node {
		n := *src
		n.ID = NewID("n")
		n.Children = []string{}
		n.ParentID = parentID
		n.TS = now
		p.Nodes[n.ID] = &n
		for _, childID := range src.Children {
			if child := p.Nodes[childID]; child != nil {
				c := clone(child, &n.ID)
				n.Children = append(n.Children, c.ID)
			}
		}
		return &n
	}
	var parent *string
	if original.ParentID != nil {
		parent = original.ParentID
	}
	c := clone(original, parent)
	c.X += dx
	c.Y += dy
	if original.Type == "group" {
		for _, childID := range c.Children {
			shiftTree(p, childID, dx, dy)
		}
	}
	if parent != nil {
		if pnode := p.Nodes[*parent]; pnode != nil {
			idx := indexOf(pnode.Children, id)
			pnode.Children = insertAt(pnode.Children, idx+1, c.ID)
			pnode.TS = now
		}
	} else {
		idx := indexOf(p.RootIDs, id)
		p.RootIDs = insertAt(p.RootIDs, idx+1, c.ID)
	}
	p.TS = now
	return c
}

func shiftTree(p *Page, id string, dx, dy float64) {
	n := p.Nodes[id]
	if n == nil {
		return
	}
	for _, child := range n.Children {
		shiftTree(p, child, dx, dy)
	}
	if n.Type != "group" {
		n.X += dx
		n.Y += dy
		n.TS = Now()
	}
}

func (d *Doc) FindFrame(name string) (*Page, *Node) {
	needle := strings.ToLower(strings.TrimSpace(name))
	if needle == "" {
		return nil, nil
	}
	var contains *Page
	var containsNode *Node
	for _, p := range d.Pages {
		for _, n := range p.Nodes {
			if n.Type != "frame" {
				continue
			}
			if strings.ToLower(n.Name) == needle {
				return p, n
			}
			if contains == nil && strings.Contains(strings.ToLower(n.Name), needle) {
				contains, containsNode = p, n
			}
		}
	}
	return contains, containsNode
}

func (d *Doc) Summary(pageID string) map[string]any {
	pages := []map[string]any{}
	for _, p := range d.Pages {
		pages = append(pages, map[string]any{"id": p.ID, "name": p.Name, "layers": len(p.Nodes)})
	}
	p := d.Page(pageID)
	if p == nil {
		return map[string]any{"pages": pages, "pageId": "", "nodes": []any{}}
	}
	nodes := []map[string]any{}
	for _, n := range p.Nodes {
		if len(nodes) >= 300 {
			break
		}
		fill := ""
		if n.Fill != nil {
			fill = n.Fill.Color
			if n.Fill.Type == "linear" {
				fill = "linear-gradient"
			}
		}
		item := map[string]any{
			"id": n.ID, "type": n.Type, "name": n.Name, "parentId": n.ParentID,
			"x": round(n.X), "y": round(n.Y), "width": round(n.Width), "height": round(n.Height),
			"fill": fill,
		}
		if n.Text != "" {
			item["text"] = TruncateText(n.Text, 160)
			item["fontSize"] = n.FontSize
			item["fontWeight"] = n.FontWeight
		}
		if n.Link != nil {
			item["link"] = n.Link
		}
		nodes = append(nodes, item)
	}
	return map[string]any{
		"pages":   pages,
		"pageId":  p.ID,
		"page":    p.Name,
		"rootIds": p.RootIDs,
		"nodes":   nodes,
		"count":   len(p.Nodes),
	}
}

func insertAt(s []string, i int, v string) []string {
	if i < 0 {
		i = 0
	}
	if i > len(s) {
		i = len(s)
	}
	s = append(s, "")
	copy(s[i+1:], s[i:])
	s[i] = v
	return s
}

func removeString(s []string, v string) []string {
	out := s[:0]
	for _, item := range s {
		if item != v {
			out = append(out, item)
		}
	}
	return out
}

func indexOf(s []string, v string) int {
	for i, item := range s {
		if item == v {
			return i
		}
	}
	return len(s) - 1
}

func clamp(v, minV, maxV float64) float64 {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func round(v float64) float64 {
	return float64(int(v*100)) / 100
}

func TruncateText(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
