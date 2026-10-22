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
