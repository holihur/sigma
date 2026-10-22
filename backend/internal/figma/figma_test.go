package figma

import "testing"

func TestParseFileKey(t *testing.T) {
	cases := map[string]string{
		"https://www.figma.com/file/AbCdEf123456/My-App":       "AbCdEf123456",
		"https://www.figma.com/design/AbCdEf123456/My-App?x=1": "AbCdEf123456",
		"AbCdEf123456": "AbCdEf123456",
	}
	for in, want := range cases {
		got, err := ParseFileKey(in)
		if err != nil || got != want {
			t.Fatalf("ParseFileKey(%q)=%q,%v want %q", in, got, err, want)
		}
	}
	if _, err := ParseFileKey("https://example.com/file/abc"); err == nil {
		t.Fatal("expected non-Figma URL error")
	}
}

func TestConvertFigmaFile(t *testing.T) {
	raw := `{
	  "name": "Imported App",
	  "document": {
	    "id": "0:0", "name": "Document", "type": "DOCUMENT",
	    "children": [{
	      "id": "0:1", "name": "Screens", "type": "CANVAS",
	      "children": [{
	        "id": "1:1", "name": "Login", "type": "FRAME", "clipsContent": true,
	        "absoluteBoundingBox": {"x": 100, "y": 100, "width": 390, "height": 844},
	        "fills": [{"type": "SOLID", "color": {"r": 1, "g": 1, "b": 1, "a": 1}}],
	        "children": [
	          {"id": "1:2", "name": "Primary Button", "type": "RECTANGLE",
	           "absoluteBoundingBox": {"x": 120, "y": 680, "width": 350, "height": 48},
	           "fills": [{"type": "SOLID", "color": {"r": 0, "g": 0.55, "b": 1, "a": 1}}],
	           "cornerRadius": 12},
	          {"id": "1:3", "name": "Title", "type": "TEXT", "characters": "Welcome back",
	           "absoluteBoundingBox": {"x": 120, "y": 180, "width": 300, "height": 40},
	           "style": {"fontFamily": "Inter", "fontSize": 28, "fontWeight": 700, "lineHeightPx": 36, "textAlignHorizontal": "CENTER"}},
	          {"id": "1:4", "name": "Group", "type": "GROUP",
	           "absoluteBoundingBox": {"x": 120, "y": 260, "width": 350, "height": 80},
	           "children": [
	             {"id": "1:5", "name": "Field", "type": "RECTANGLE",
	              "absoluteBoundingBox": {"x": 120, "y": 260, "width": 350, "height": 48},
	              "fills": [{"type": "SOLID", "color": {"r": 0.9, "g": 0.9, "b": 0.9, "a": 1}}]}
	           ]}
	        ]
	      }, {
	        "id": "2:1", "name": "Empty", "type": "FRAME",
	        "absoluteBoundingBox": {"x": 600, "y": 100, "width": 200, "height": 200}
	      }]
	    }]
	  }
	}`
	doc, name, err := ConvertFile([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if name != "Imported App" || len(doc.Pages) != 1 {
		t.Fatalf("bad file: %q %d", name, len(doc.Pages))
	}
	page := doc.Pages[0]
	if page.Name != "Screens" || len(page.RootIDs) != 2 {
		t.Fatalf("bad page: %#v", page)
	}
	var frame *struct{}
	_ = frame
	login := page.Node(page.RootIDs[0])
	if login == nil || login.Name != "Login" || login.X != 100 || login.Y != 100 || login.Width != 390 || !login.Clip {
		t.Fatalf("bad frame: %#v", login)
	}
	if len(login.Children) != 3 {
		t.Fatalf("expected 3 children, got %d", len(login.Children))
	}
	button := page.Node(login.Children[0])
	if button == nil || button.X != 20 || button.Y != 580 || button.Radius != 12 || button.Fill == nil || button.Fill.Color != "#008cff" {
		t.Fatalf("bad button: %#v", button)
	}
	text := page.Node(login.Children[1])
	if text == nil || text.Text != "Welcome back" || text.FontSize != 28 || text.TextAlign != "center" {
		t.Fatalf("bad text: %#v", text)
	}
	group := page.Node(login.Children[2])
	if group == nil || group.Type != "group" || group.X != 0 || group.Y != 0 {
		t.Fatalf("bad group: %#v", group)
	}
	field := page.Node(group.Children[0])
	if field == nil || field.X != 20 || field.Y != 160 {
		t.Fatalf("bad group child: %#v", field)
	}
}

func TestPathDataParsing(t *testing.T) {
	subs := parsePathData("M 10 10 L 90 10 C 98 18 98 82 90 90 Z M 30 30 L 70 30 L 70 70 Z")
	if len(subs) != 2 || !subs[0].Closed || len(subs[0].Points) != 3 || subs[0].Points[1].Out == nil {
		t.Fatalf("unexpected subpaths: %#v", subs)
	}
	if len(subs[1].Points) != 3 || !subs[1].Closed {
		t.Fatalf("unexpected second path: %#v", subs[1])
	}
}

func TestConvertFigmaVectorGeometry(t *testing.T) {
	raw := `{"name":"Vector file","document":{"type":"DOCUMENT","children":[{"type":"CANVAS","name":"Page 1","children":[
	  {"id":"1:2","name":"Icon","type":"VECTOR",
	   "absoluteBoundingBox":{"x":100,"y":100,"width":80,"height":80},
	   "fills":[{"type":"SOLID","color":{"r":0,"g":0.4,"b":1,"a":1}}],
	   "fillGeometry":[{"path":"M 100 100 L 180 100 L 180 180 L 100 180 Z","windingRule":"NONZERO"}]}
	]}]}}`
	doc, _, err := ConvertFile([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	node := doc.Pages[0].Node(doc.Pages[0].RootIDs[0])
	if node == nil || node.Type != "vector" || len(node.Subpaths) != 1 {
		t.Fatalf("vector not converted: %#v", node)
	}
	if node.X != 100 || node.Y != 100 || node.Width != 80 || node.Height != 80 {
		t.Fatalf("bad vector bounds: %#v", node)
	}
	if node.Subpaths[0].Points[0].X != 0 || node.Subpaths[0].Points[2].X != 1 {
		t.Fatalf("bad normalized points: %#v", node.Subpaths[0].Points)
	}
}
