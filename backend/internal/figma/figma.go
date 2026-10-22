// Package figma converts Figma REST / plugin JSON into Sigma documents.
package figma

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"sigma/internal/design"
)

const DefaultBaseURL = "https://api.figma.com"

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func NewClient() *Client {
	return &Client{BaseURL: DefaultBaseURL, HTTP: &http.Client{Timeout: 90 * time.Second}}
}

var fileKeyRe = regexp.MustCompile(`(?i)/(?:file|design|proto)/([a-z0-9]+)`)
var bareKeyRe = regexp.MustCompile(`^[A-Za-z0-9]{8,}$`)

func ParseFileKey(input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", errors.New("enter a Figma file URL or file key")
	}
	if u, err := url.Parse(input); err == nil && u.Host != "" {
		host := strings.ToLower(u.Hostname())
		if host != "figma.com" && !strings.HasSuffix(host, ".figma.com") {
			return "", errors.New("that URL is not a Figma file URL")
		}
		if m := fileKeyRe.FindStringSubmatch(u.Path); len(m) == 2 {
			return m[1], nil
		}
		return "", errors.New("could not find a Figma file key in that URL")
	}
	if bareKeyRe.MatchString(input) {
		return input, nil
	}
	return "", errors.New("could not find a Figma file key in that URL")
}

type rawFile struct {
	Name     string  `json:"name"`
	Document rawNode `json:"document"`
	Err      string  `json:"err"`
	Message  string  `json:"message"`
}

type rawNode struct {
	ID                   string        `json:"id"`
	Name                 string        `json:"name"`
	Type                 string        `json:"type"`
	Children             []rawNode     `json:"children"`
	AbsoluteBoundingBox  *rawBox       `json:"absoluteBoundingBox"`
	Fills                []rawPaint    `json:"fills"`
	Strokes              []rawPaint    `json:"strokes"`
	StrokeWeight         *float64      `json:"strokeWeight"`
	CornerRadius         *float64      `json:"cornerRadius"`
	RectangleCornerRadii []float64     `json:"rectangleCornerRadii"`
	Opacity              *float64      `json:"opacity"`
	Visible              *bool         `json:"visible"`
	ClipsContent         bool          `json:"clipsContent"`
	FillGeometry         []rawGeometry `json:"fillGeometry"`
	StrokeGeometry       []rawGeometry `json:"strokeGeometry"`
	Characters           string        `json:"characters"`
	Style                *rawTextStyle `json:"style"`
	Effects              []rawEffect   `json:"effects"`
	TextAlignVertical    string        `json:"textAlignVertical"`
	Rotation             *float64      `json:"rotation"`
	LayoutMode           string        `json:"layoutMode"`
}

type rawGeometry struct {
	Path        string `json:"path"`
	WindingRule string `json:"windingRule"`
}

type rawBox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type rawColor struct {
	R float64 `json:"r"`
	G float64 `json:"g"`
	B float64 `json:"b"`
	A float64 `json:"a"`
}

type rawPaint struct {
	Type                    string      `json:"type"`
	Visible                 *bool       `json:"visible"`
	Opacity                 float64     `json:"opacity"`
	Color                   *rawColor   `json:"color"`
	GradientStops           []rawStop   `json:"gradientStops"`
	GradientHandlePositions []rawHandle `json:"gradientHandlePositions"`
}

type rawStop struct {
	Position float64  `json:"position"`
	Color    rawColor `json:"color"`
}

type rawHandle struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type rawTextStyle struct {
	FontFamily          string  `json:"fontFamily"`
	FontSize            float64 `json:"fontSize"`
	FontWeight          float64 `json:"fontWeight"`
	LineHeightPx        float64 `json:"lineHeightPx"`
	LetterSpacing       float64 `json:"letterSpacing"`
	TextAlignHorizontal string  `json:"textAlignHorizontal"`
	TextAlignVertical   string  `json:"textAlignVertical"`
}

type rawEffect struct {
	Type    string    `json:"type"`
	Visible *bool     `json:"visible"`
	Color   *rawColor `json:"color"`
	Offset  *struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"offset"`
	Radius float64 `json:"radius"`
	Spread float64 `json:"spread"`
}

// Fetch downloads a Figma file using a personal access token.
func (c *Client) Fetch(ctx context.Context, fileKey, token string) ([]byte, error) {
	if c == nil {
		c = NewClient()
	}
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("a Figma personal access token is required")
	}
	base := strings.TrimRight(c.BaseURL, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/v1/files/"+url.PathEscape(fileKey)+"?geometry=paths", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Figma-Token", strings.TrimSpace(token))
	req.Header.Set("User-Agent", "sigma-figma-import")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 96<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		var e struct {
			Err     string `json:"err"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(body, &e)
		msg := e.Message
		if msg == "" {
			msg = e.Err
		}
		if msg == "" {
			msg = fmt.Sprintf("Figma API returned %d", res.StatusCode)
		}
		return nil, errors.New(msg)
	}
	return body, nil
}

// ConvertFile converts a /v1/files response into a Sigma document.
func ConvertFile(data []byte) (*design.Doc, string, error) {
	var f rawFile
	dec := json.NewDecoder(bytes.NewReader(data))
	if err := dec.Decode(&f); err != nil {
		return nil, "", err
	}
	if f.Document.Type == "" && len(f.Document.Children) == 0 {
		return nil, "", errors.New("this JSON does not look like a Figma file response")
	}
	doc := &design.Doc{Pages: []*design.Page{}, Tombstones: map[string]int64{}, DeletedPages: map[string]int64{}}
	for _, page := range f.Document.Children {
		if page.Type != "CANVAS" && page.Type != "PAGE" {
			continue
		}
		p := &design.Page{ID: design.NewID("p"), Name: page.Name, Nodes: map[string]*design.Node{}, RootIDs: []string{}, TS: design.Now()}
		if p.Name == "" {
			p.Name = "Page"
		}
		for _, child := range page.Children {
			emit(&child, p, "", 0, 0)
		}
		doc.Pages = append(doc.Pages, p)
	}
	if len(doc.Pages) == 0 {
		doc.Pages = append(doc.Pages, &design.Page{ID: design.NewID("p"), Name: "Page 1", Nodes: map[string]*design.Node{}, RootIDs: []string{}, TS: design.Now()})
	}
	return doc, f.Name, nil
}

func emit(n *rawNode, page *design.Page, parentID string, originX, originY float64) {
	if n == nil {
		return
	}
	typ := strings.ToUpper(n.Type)
	if typ == "SLICE" || typ == "CANVAS" || typ == "PAGE" {
		for i := range n.Children {
			emit(&n.Children[i], page, parentID, originX, originY)
		}
		return
	}
	box := n.AbsoluteBoundingBox
	if box == nil || (box.Width <= 0 && box.Height <= 0 && len(n.Children) == 0 && n.Characters == "") {
		for i := range n.Children {
			emit(&n.Children[i], page, parentID, originX, originY)
		}
		return
	}
	x, y := 0.0, 0.0
	w, h := 100.0, 100.0
	if box != nil {
		x = box.X - originX
		y = box.Y - originY
		w = box.Width
		h = box.Height
	}
	if (typ == "VECTOR" || typ == "BOOLEAN_OPERATION" || typ == "STAR" || typ == "POLYGON" || typ == "REGULAR_POLYGON") && len(n.FillGeometry) > 0 {
		if v := vectorNode(n, box, originX, originY); v != nil {
			page.Add(v, parentID, -1)
			return
		}
	}
	nodeType := "rect"
	switch typ {
	case "FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE":
		nodeType = "frame"
	case "GROUP":
		nodeType = "group"
	case "ELLIPSE":
		nodeType = "ellipse"
	case "TEXT":
		nodeType = "text"
	case "LINE":
		nodeType = "line"
	case "RECTANGLE", "VECTOR", "STAR", "POLYGON", "REGULAR_POLYGON", "BOOLEAN_OPERATION":
		nodeType = "rect"
	case "IMAGE":
		nodeType = "image"
	default:
		if len(n.Children) > 0 {
			nodeType = "group"
		}
	}
	name := n.Name
	if name == "" {
		name = strings.Title(strings.ToLower(typ))
	}
	node := design.NewNode(nodeType, name, x, y, math.Max(w, 1), math.Max(h, 0))
	applyPaint(node, n)
	if typ == "GROUP" {
		// Groups in Sigma are zero-origin containers; children keep the
		// coordinate space of their nearest frame/page.
		node.X, node.Y = 0, 0
		node.Width, node.Height = math.Max(w, 1), math.Max(h, 0)
	}
	if n.Visible != nil {
		node.Visible = *n.Visible
	}
	if n.Opacity != nil {
		node.Opacity = clamp(*n.Opacity, 0, 1)
	}
	if n.CornerRadius != nil {
		node.Radius = *n.CornerRadius
	} else if len(n.RectangleCornerRadii) > 0 {
		node.Radius = n.RectangleCornerRadii[0]
	}
	if n.StrokeWeight != nil {
		node.StrokeWidth = *n.StrokeWeight
	}
	if nodeType == "frame" {
		node.Clip = n.ClipsContent
		if node.Fill == nil {
			node.Fill = design.Solid("#ffffff")
		}
	}
	if nodeType == "text" {
		applyText(node, n)
	}
	applyStroke(node, n)
	applyEffects(node, n)
	page.Add(node, parentID, -1)
	if len(n.Children) > 0 {
		childOriginX, childOriginY := originX, originY
		if nodeType == "frame" || nodeType == "image" {
			childOriginX, childOriginY = box.X, box.Y
		}
		for i := range n.Children {
			emit(&n.Children[i], page, node.ID, childOriginX, childOriginY)
		}
	}
}

func vectorNode(n *rawNode, box *rawBox, originX, originY float64) *design.Node {
	var subpaths []design.VectorSubpath
	fillRule := ""
	for _, g := range n.FillGeometry {
		if strings.TrimSpace(g.Path) == "" {
			continue
		}
		paths := parsePathData(g.Path)
		subpaths = append(subpaths, paths...)
		if fillRule == "" && g.WindingRule != "" {
			fillRule = strings.ToLower(g.WindingRule)
		}
	}
	if len(subpaths) == 0 {
		for _, g := range n.StrokeGeometry {
			if strings.TrimSpace(g.Path) != "" {
				subpaths = append(subpaths, parsePathData(g.Path)...)
			}
		}
	}
	if len(subpaths) == 0 {
		return nil
	}
	baseX, baseY := 0.0, 0.0
	if box != nil {
		minX, minY, maxX, maxY := pathBounds(subpaths)
		if minX >= box.X-1 && maxX <= box.X+box.Width+1 && minY >= box.Y-1 && maxY <= box.Y+box.Height+1 {
			baseX, baseY = box.X, box.Y
		}
	}
	_ = originX
	_ = originY
	minX, minY, maxX, maxY := pathBounds(subpaths)
	if box == nil {
		box = &rawBox{X: minX, Y: minY, Width: maxX - minX, Height: maxY - minY}
	}
	w := math.Max(box.Width, 1)
	h := math.Max(box.Height, 1)
	for i := range subpaths {
		for j := range subpaths[i].Points {
			pt := &subpaths[i].Points[j]
			pt.X = (pt.X - baseX) / w
			pt.Y = (pt.Y - baseY) / h
			if pt.In != nil {
				pt.In.X = (pt.In.X - baseX) / w
				pt.In.Y = (pt.In.Y - baseY) / h
			}
			if pt.Out != nil {
				pt.Out.X = (pt.Out.X - baseX) / w
				pt.Out.Y = (pt.Out.Y - baseY) / h
			}
		}
	}
	name := n.Name
	if name == "" {
		name = "Vector"
	}
	node := design.NewNode("vector", name, box.X, box.Y, w, h)
	node.Subpaths = subpaths
	node.Points = subpaths[0].Points
	node.Closed = subpaths[0].Closed
	if fillRule == "evenodd" || fillRule == "even-odd" {
		node.FillRule = "evenodd"
	} else if fillRule != "" {
		node.FillRule = "nonzero"
	}
	applyPaint(node, n)
	if node.Fill == nil && len(n.StrokeGeometry) > 0 {
		node.Fill = nil
	}
	applyStroke(node, n)
	applyEffects(node, n)
	if n.Visible != nil {
		node.Visible = *n.Visible
	}
	if n.Opacity != nil {
		node.Opacity = clamp(*n.Opacity, 0, 1)
	}
	return node
}

func pathBounds(subpaths []design.VectorSubpath) (minX, minY, maxX, maxY float64) {
	minX, minY = math.Inf(1), math.Inf(1)
	maxX, maxY = math.Inf(-1), math.Inf(-1)
	add := func(x, y float64) {
		if x < minX {
			minX = x
		}
		if y < minY {
			minY = y
		}
		if x > maxX {
			maxX = x
		}
		if y > maxY {
			maxY = y
		}
	}
	for _, sub := range subpaths {
		for _, p := range sub.Points {
			add(p.X, p.Y)
			if p.In != nil {
				add(p.In.X, p.In.Y)
			}
			if p.Out != nil {
				add(p.Out.X, p.Out.Y)
			}
		}
	}
	return
}

func applyPaint(node *design.Node, n *rawNode) {
	if len(n.Fills) == 0 {
		if node.Type == "text" || node.Type == "line" {
			return
		}
		return
	}
	for _, f := range n.Fills {
		if f.Visible != nil && !*f.Visible {
			continue
		}
		switch strings.ToUpper(f.Type) {
		case "SOLID":
			if f.Color == nil {
				continue
			}
			col := hexColor(*f.Color)
			if f.Opacity > 0 && f.Opacity < 1 {
				node.Fill = &design.Paint{Type: "solid", Color: col, Opacity: f.Opacity}
			} else {
				node.Fill = design.Solid(col)
			}
			return
		case "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND":
			if len(f.GradientStops) == 0 {
				continue
			}
			stops := make([]design.Stop, 0, len(f.GradientStops))
			for _, st := range f.GradientStops {
				stops = append(stops, design.Stop{Color: hexColor(st.Color), Position: clamp(st.Position, 0, 1)})
			}
			node.Fill = &design.Paint{Type: "linear", Stops: stops, Angle: gradientAngle(f), Opacity: f.Opacity}
			return
		case "IMAGE":
			node.Fill = design.Solid("#e2e8f0")
			return
		}
	}
}

func applyStroke(node *design.Node, n *rawNode) {
	for _, s := range n.Strokes {
		if s.Visible != nil && !*s.Visible {
			continue
		}
		if strings.ToUpper(s.Type) == "SOLID" && s.Color != nil {
			node.Stroke = design.Solid(hexColor(*s.Color))
			if node.StrokeWidth <= 0 {
				node.StrokeWidth = 1
			}
			return
		}
	}
}

func applyText(node *design.Node, n *rawNode) {
	node.Text = n.Characters
	if node.Text == "" {
		node.Text = " "
	}
	if n.Style != nil {
		s := n.Style
		if s.FontFamily != "" {
			node.FontFamily = s.FontFamily
		}
		if s.FontSize > 0 {
			node.FontSize = s.FontSize
		}
		if s.FontWeight > 0 {
			node.FontWeight = int(s.FontWeight)
		}
		if s.LineHeightPx > 0 && s.FontSize > 0 {
			node.LineHeight = s.LineHeightPx / s.FontSize
		}
		node.LetterSpacing = s.LetterSpacing
		switch strings.ToUpper(s.TextAlignHorizontal) {
		case "CENTER":
			node.TextAlign = "center"
		case "RIGHT":
			node.TextAlign = "right"
		default:
			node.TextAlign = "left"
		}
		switch strings.ToUpper(s.TextAlignVertical) {
		case "CENTER":
			node.VerticalAlign = "middle"
		case "BOTTOM":
			node.VerticalAlign = "bottom"
		default:
			node.VerticalAlign = "top"
		}
	}
	if node.Fill == nil {
		node.Fill = design.Solid("#111827")
	}
}

func applyEffects(node *design.Node, n *rawNode) {
	for _, e := range n.Effects {
		if e.Visible != nil && !*e.Visible {
			continue
		}
		switch strings.ToUpper(e.Type) {
		case "DROP_SHADOW", "INNER_SHADOW":
			if node.Shadow != nil || e.Color == nil {
				continue
			}
			sh := &design.Shadow{Blur: e.Radius, Spread: e.Spread, Color: hexColor(*e.Color)}
			if e.Offset != nil {
				sh.X, sh.Y = e.Offset.X, e.Offset.Y
			}
			node.Shadow = sh
		case "LAYER_BLUR":
			node.Blur = e.Radius
		}
	}
}

func gradientAngle(p rawPaint) float64 {
	if len(p.GradientHandlePositions) < 2 {
		return 90
	}
	dx := p.GradientHandlePositions[1].X - p.GradientHandlePositions[0].X
	dy := p.GradientHandlePositions[1].Y - p.GradientHandlePositions[0].Y
	return math.Atan2(dy, dx)*180/math.Pi + 90
}

func hexColor(c rawColor) string {
	r := int(math.Round(clamp(c.R, 0, 1) * 255))
	g := int(math.Round(clamp(c.G, 0, 1) * 255))
	b := int(math.Round(clamp(c.B, 0, 1) * 255))
	a := clamp(c.A, 0, 1)
	if a == 0 {
		a = 1
	}
	if a < 0.999 {
		return fmt.Sprintf("#%02x%02x%02x%02x", r, g, b, int(math.Round(a*255)))
	}
	return fmt.Sprintf("#%02x%02x%02x", r, g, b)
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
