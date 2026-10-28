package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"sigma/internal/auth"
	"sigma/internal/design"
	"sigma/internal/model"
	"sigma/internal/templates"
)

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func mcpProp(typ, desc string) map[string]any {
	return map[string]any{"type": typ, "description": desc}
}

func mcpSchema(props map[string]any, required ...string) map[string]any {
	s := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func mcpTool(name, description string, schema map[string]any) map[string]any {
	return map[string]any{"name": name, "description": description, "inputSchema": schema}
}

func (a *API) mcpTools() []map[string]any {
	fileID := mcpProp("string", "Sigma file id")
	pageID := mcpProp("string", "Page id; omit to use the first page")
	return []map[string]any{
		mcpTool("list_files", "List design files visible to the current user. Supports limit/offset pagination.", mcpSchema(map[string]any{
			"limit": mcpProp("number", "Page size (default 50, max 200)"), "offset": mcpProp("number", "Zero-based offset"),
		})),
		mcpTool("get_file", "Get file metadata and the full design document.", mcpSchema(map[string]any{"fileId": fileID}, "fileId")),
		mcpTool("list_pages", "List pages in a design file.", mcpSchema(map[string]any{"fileId": fileID}, "fileId")),
		mcpTool("get_page", "Get a compact page summary with layer ids, positions, text and links.", mcpSchema(map[string]any{"fileId": fileID, "pageId": pageID}, "fileId")),
		mcpTool("create_file", "Create a new design from a built-in template.", mcpSchema(map[string]any{
			"name": mcpProp("string", "File name"), "template": mcpProp("string", "blank | mobile | website | dashboard"),
		}, "name")),
		mcpTool("create_frame", "Create a frame/artboard.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "name": mcpProp("string", "Frame name"),
			"x": mcpProp("number", "X"), "y": mcpProp("number", "Y"), "width": mcpProp("number", "Width"),
			"height": mcpProp("number", "Height"), "fill": mcpProp("string", "Hex fill color"),
			"radius": mcpProp("number", "Corner radius"), "parentId": mcpProp("string", "Optional parent frame id"),
		}, "fileId", "name", "width", "height")),
		mcpTool("create_rect", "Create a rectangle, card or button.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "name": mcpProp("string", "Layer name"),
			"x": mcpProp("number", "X"), "y": mcpProp("number", "Y"), "width": mcpProp("number", "Width"),
			"height": mcpProp("number", "Height"), "fill": mcpProp("string", "Hex fill color"),
			"radius": mcpProp("number", "Corner radius"), "parentId": mcpProp("string", "Optional parent frame id"),
		}, "fileId", "width", "height")),
		mcpTool("create_vector", "Create an editable vector path. Points are normalized 0..1 inside the node box.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "name": mcpProp("string", "Layer name"),
			"x": mcpProp("number", "X"), "y": mcpProp("number", "Y"), "width": mcpProp("number", "Width"),
			"height": mcpProp("number", "Height"), "points": map[string]any{"type": "array", "items": map[string]any{"type": "object", "properties": map[string]any{"x": mcpProp("number", "X 0..1"), "y": mcpProp("number", "Y 0..1")}}},
			"closed": mcpProp("boolean", "Close the path"), "fill": mcpProp("string", "Hex fill"), "stroke": mcpProp("string", "Hex stroke"),
			"strokeWidth": mcpProp("number", "Stroke width"), "parentId": mcpProp("string", "Optional parent frame id"),
		}, "fileId")),
		mcpTool("create_ellipse", "Create an ellipse/avatar/decoration.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "name": mcpProp("string", "Layer name"),
			"x": mcpProp("number", "X"), "y": mcpProp("number", "Y"), "width": mcpProp("number", "Width"),
			"height": mcpProp("number", "Height"), "fill": mcpProp("string", "Hex fill color"),
			"parentId": mcpProp("string", "Optional parent frame id"),
		}, "fileId", "width", "height")),
		mcpTool("create_text", "Create a text layer.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "text": mcpProp("string", "Text content"),
			"name": mcpProp("string", "Layer name"), "x": mcpProp("number", "X"), "y": mcpProp("number", "Y"),
			"width": mcpProp("number", "Width"), "height": mcpProp("number", "Height"),
			"fontSize": mcpProp("number", "Font size"), "fontWeight": mcpProp("number", "Font weight"),
			"color": mcpProp("string", "Hex text color"), "textAlign": mcpProp("string", "left | center | right"),
			"parentId": mcpProp("string", "Optional parent frame id"),
		}, "fileId", "text")),
		mcpTool("update_node", "Update an existing layer by id.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "nodeId": mcpProp("string", "Layer id"),
			"name": mcpProp("string", "Name"), "x": mcpProp("number", "X"), "y": mcpProp("number", "Y"),
			"width": mcpProp("number", "Width"), "height": mcpProp("number", "Height"),
			"fill": mcpProp("string", "Hex fill"), "text": mcpProp("string", "Text content"),
			"fontSize": mcpProp("number", "Font size"), "fontWeight": mcpProp("number", "Font weight"),
			"opacity": mcpProp("number", "Opacity 0-1"), "radius": mcpProp("number", "Corner radius"),
			"rotation": mcpProp("number", "Rotation degrees"),
		}, "fileId", "nodeId")),
		mcpTool("delete_nodes", "Delete one or more layers and their children.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "nodeIds": map[string]any{"type": "array", "items": mcpProp("string", "Layer id")},
		}, "fileId", "nodeIds")),
		mcpTool("duplicate_node", "Duplicate a layer and its children.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "nodeId": mcpProp("string", "Layer id"),
			"offsetX": mcpProp("number", "X offset"), "offsetY": mcpProp("number", "Y offset"),
		}, "fileId", "nodeId")),
		mcpTool("link_to_frame", "Create a prototype click-through link to a frame.", mcpSchema(map[string]any{
			"fileId": fileID, "pageId": pageID, "nodeId": mcpProp("string", "Source layer id"),
			"targetFrameId": mcpProp("string", "Target frame id"), "targetFrameName": mcpProp("string", "Target frame name"),
			"targetPageId": mcpProp("string", "Target page id"), "transition": mcpProp("string", "instant | dissolve | slide-left | slide-up"),
		}, "fileId", "nodeId")),
	}
}

func mcpToolIsWrite(name string) bool {
	switch name {
	case "create_file", "create_frame", "create_rect", "create_ellipse", "create_vector", "create_text",
		"update_node", "delete_nodes", "duplicate_node", "link_to_frame":
		return true
	}
	return false
}

func mcpToolExists(name string) bool {
	switch name {
	case "list_files", "get_file", "list_pages", "get_page", "create_file",
		"create_frame", "create_rect", "create_ellipse", "create_vector", "create_text",
		"update_node", "delete_nodes", "duplicate_node", "link_to_frame":
		return true
	}
	return false
}

func mcpScopeDenied(want string) map[string]any {
	return map[string]any{
		"isError": true,
		"content": []map[string]any{{"type": "text", "text": "This personal access token is missing the " + want + " scope."}},
	}
}

func (a *API) handleMCP(w http.ResponseWriter, r *http.Request, u model.User, scopes []string, viaPAT bool) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, http.StatusMethodNotAllowed, "MCP endpoint expects POST JSON-RPC requests")
		return
	}
	var req rpcRequest
	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "Parse error"}})
		return
	}
	isNotification := len(req.ID) == 0 || string(req.ID) == "null"
	if isNotification {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	respond := func(result any, rerr *rpcError) {
		writeJSON(w, http.StatusOK, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result, Error: rerr})
	}
	switch req.Method {
	case "initialize":
		respond(map[string]any{
			"protocolVersion": "2025-03-26",
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "sigma", "version": "1.0.0"},
			"instructions":    "Sigma is a collaborative prototyping canvas. Use the tools to inspect and edit design files.",
		}, nil)
	case "ping":
		respond(map[string]any{}, nil)
	case "tools/list":
		if viaPAT && !auth.HasScope(scopes, auth.ScopeMCPRead) {
			respond(nil, &rpcError{Code: -32001, Message: "This personal access token is missing the mcp:read scope."})
			return
		}
		respond(map[string]any{"tools": a.mcpTools()}, nil)
	case "tools/call":
		var params struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil || params.Name == "" {
			respond(nil, &rpcError{Code: -32602, Message: "Invalid tool call params"})
			return
		}
		if viaPAT {
			need := auth.ScopeMCPRead
			if mcpToolIsWrite(params.Name) {
				need = auth.ScopeMCPWrite
			}
			if !auth.HasScope(scopes, need) {
				respond(mcpScopeDenied(need), nil)
				return
			}
		}
		result, err := a.mcpCallTool(u, params.Name, params.Arguments)
		if err != nil {
			respond(map[string]any{
				"isError": true,
				"content": []map[string]any{{"type": "text", "text": err.Error()}},
			}, nil)
			return
		}
		raw, _ := json.MarshalIndent(result, "", "  ")
		respond(map[string]any{
			"content":           []map[string]any{{"type": "text", "text": string(raw)}},
			"structuredContent": result,
		}, nil)
	default:
		respond(nil, &rpcError{Code: -32601, Message: "Method not found: " + req.Method})
	}
}

func (a *API) mcpCallTool(u model.User, name string, args map[string]any) (map[string]any, error) {
	fileID, _ := args["fileId"].(string)
	pageID, _ := args["pageId"].(string)
	switch name {
	case "list_files":
		files, err := a.st.ListFiles(u.ID)
		if err != nil {
			return nil, err
		}
		limit := int(mcpNumOr(args, "limit", 50))
		offset := int(mcpNumOr(args, "offset", 0))
		if limit < 1 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}
		if offset < 0 {
			offset = 0
		}
		total := len(files)
		if offset > total {
			offset = total
		}
		end := offset + limit
		if end > total {
			end = total
		}
		result := map[string]any{"files": files[offset:end], "total": total, "limit": limit, "offset": offset}
		if end < total {
			result["nextOffset"] = end
		}
		return result, nil
	case "get_file":
		if a.accessRole(fileID, u) == "" {
			return nil, fmt.Errorf("file not found")
		}
		f, err := a.st.File(fileID)
		if err != nil {
			return nil, err
		}
		meta, err := a.st.FileMeta(fileID, u.ID)
		return map[string]any{"file": meta, "doc": json.RawMessage(f.Doc)}, err
	case "list_pages":
		if a.accessRole(fileID, u) == "" {
			return nil, fmt.Errorf("file not found")
		}
		f, err := a.st.File(fileID)
		if err != nil {
			return nil, err
		}
		d, err := design.Parse(f.Doc)
		if err != nil {
			return nil, err
		}
		pages := []map[string]any{}
		for _, p := range d.Pages {
			pages = append(pages, map[string]any{"id": p.ID, "name": p.Name, "layers": len(p.Nodes)})
		}
		return map[string]any{"pages": pages}, nil
	case "get_page":
		if a.accessRole(fileID, u) == "" {
			return nil, fmt.Errorf("file not found")
		}
		f, err := a.st.File(fileID)
		if err != nil {
			return nil, err
		}
		d, err := design.Parse(f.Doc)
		if err != nil {
			return nil, err
		}
		return d.Summary(pageID), nil
	case "create_file":
		name, _ := args["name"].(string)
		tmpl, _ := args["template"].(string)
		if strings.TrimSpace(name) == "" {
			name = "Untitled design"
		}
		if tmpl == "" {
			tmpl = "blank"
		}
		doc, ok := templates.Load(tmpl)
		if !ok {
			return nil, fmt.Errorf("unknown template %q", tmpl)
		}
		meta, err := a.st.CreateFile(newID("f"), name, u.ID, string(doc), tmpl)
		return map[string]any{"file": meta}, err
	}
	if a.accessRole(fileID, u) != "owner" && a.accessRole(fileID, u) != "edit" {
		return nil, fmt.Errorf("you need edit access to this file")
	}
	if name == "create_frame" || name == "create_rect" || name == "create_ellipse" || name == "create_vector" || name == "create_text" ||
		name == "update_node" || name == "delete_nodes" || name == "duplicate_node" || name == "link_to_frame" {
		return a.mcpMutate(fileID, pageID, name, args)
	}
	return nil, fmt.Errorf("unknown tool %q", name)
}

func mcpNum(args map[string]any, key string) (float64, bool) {
	v, ok := args[key]
	if !ok || v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case json.Number:
		f, _ := n.Float64()
		return f, true
	}
	return 0, false
}

func mcpNumOr(args map[string]any, key string, fallback float64) float64 {
	if v, ok := mcpNum(args, key); ok {
		return v
	}
	return fallback
}

func mcpStr(args map[string]any, key string) string {
	s, _ := args[key].(string)
	return s
}

func (a *API) mcpMutate(fileID, pageID, tool string, args map[string]any) (map[string]any, error) {
	var out map[string]any
	recorder := &agentActionRecorder{}
	var err error
	switch tool {
	case "create_frame", "create_rect", "create_ellipse":
		typ := strings.TrimPrefix(tool, "create_")
		name := mcpStr(args, "name")
		x, _ := mcpNum(args, "x")
		y, _ := mcpNum(args, "y")
		w, _ := mcpNum(args, "width")
		h, _ := mcpNum(args, "height")
		fill := mcpStr(args, "fill")
		radius, _ := mcpNum(args, "radius")
		parentID := mcpStr(args, "parentId")
		if w <= 0 {
			w = 100
		}
		if h <= 0 {
			h = 100
		}
		node := design.NewNode(typ, name, x, y, w, h)
		if fill != "" {
			node.Fill = design.Solid(fill)
		}
		if radius > 0 {
			node.Radius = radius
		}
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Add(node, parentID, -1)
			return nil
		})
		if out != nil {
			out["nodeId"] = node.ID
			out["summary"] = "Created " + typ + " " + node.ID
		}
	case "create_vector":
		x, _ := mcpNum(args, "x")
		y, _ := mcpNum(args, "y")
		w, _ := mcpNum(args, "width")
		h, _ := mcpNum(args, "height")
		if w <= 0 {
			w = 100
		}
		if h <= 0 {
			h = 100
		}
		node := design.NewNode("vector", mcpStr(args, "name"), x, y, w, h)
		node.Closed, _ = args["closed"].(bool)
		if rawPoints, ok := args["points"].([]any); ok {
			for _, rp := range rawPoints {
				if m, ok := rp.(map[string]any); ok {
					px, _ := mcpNum(m, "x")
					py, _ := mcpNum(m, "y")
					point := design.VectorPoint{X: px, Y: py}
					for _, key := range []string{"in", "out"} {
						if h, ok := m[key].(map[string]any); ok {
							hx, _ := mcpNum(h, "x")
							hy, _ := mcpNum(h, "y")
							handle := &design.VectorHandle{X: hx, Y: hy}
							if key == "in" {
								point.In = handle
							} else {
								point.Out = handle
							}
						}
					}
					node.Points = append(node.Points, point)
				}
			}
		}
		if len(node.Points) == 0 {
			node.Points = []design.VectorPoint{{X: 0.5, Y: 0}, {X: 1, Y: 1}, {X: 0, Y: 1}}
			node.Closed = true
		}
		if v := mcpStr(args, "fill"); v != "" {
			node.Fill = design.Solid(v)
		}
		if v := mcpStr(args, "stroke"); v != "" {
			node.Stroke = design.Solid(v)
		}
		if v, ok := mcpNum(args, "strokeWidth"); ok && v > 0 {
			node.StrokeWidth = v
		}
		parentID := mcpStr(args, "parentId")
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Add(node, parentID, -1)
			return nil
		})
		if out != nil {
			out["nodeId"] = node.ID
			out["summary"] = "Created vector " + node.ID
		}
	case "create_text":
		x, _ := mcpNum(args, "x")
		y, _ := mcpNum(args, "y")
		w, _ := mcpNum(args, "width")
		h, _ := mcpNum(args, "height")
		if w <= 0 {
			w = 320
		}
		if h <= 0 {
			h = 40
		}
		node := design.NewNode("text", mcpStr(args, "name"), x, y, w, h)
		node.Text = mcpStr(args, "text")
		if v, ok := mcpNum(args, "fontSize"); ok && v > 0 {
			node.FontSize = v
		}
		if v, ok := mcpNum(args, "fontWeight"); ok && v > 0 {
			node.FontWeight = int(v)
		}
		if color := mcpStr(args, "color"); color != "" {
			node.Fill = design.Solid(color)
		}
		if align := mcpStr(args, "textAlign"); align != "" {
			node.TextAlign = align
		}
		parentID := mcpStr(args, "parentId")
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Add(node, parentID, -1)
			return nil
		})
		if out != nil {
			out["nodeId"] = node.ID
			out["summary"] = "Created text " + node.ID
		}
	case "update_node":
		nodeID := mcpStr(args, "nodeId")
		patch := design.Patch{}
		if v, ok := args["name"].(string); ok {
			patch.Name = &v
		}
		if v, ok := mcpNum(args, "x"); ok {
			patch.X = &v
		}
		if v, ok := mcpNum(args, "y"); ok {
			patch.Y = &v
		}
		if v, ok := mcpNum(args, "width"); ok {
			patch.Width = &v
		}
		if v, ok := mcpNum(args, "height"); ok {
			patch.Height = &v
		}
		if v, ok := mcpNum(args, "rotation"); ok {
			patch.Rotation = &v
		}
		if v, ok := mcpNum(args, "opacity"); ok {
			patch.Opacity = &v
		}
		if v, ok := mcpNum(args, "radius"); ok {
			patch.Radius = &v
		}
		if v, ok := args["fill"].(string); ok {
			patch.Fill = &v
		}
		if v, ok := args["text"].(string); ok {
			patch.Text = &v
		}
		if v, ok := mcpNum(args, "fontSize"); ok {
			patch.FontSize = &v
		}
		if v, ok := mcpNum(args, "fontWeight"); ok {
			fw := int(v)
			patch.FontWeight = &fw
		}
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			if _, ok := page.Update(nodeID, patch); !ok {
				return fmt.Errorf("node %s not found", nodeID)
			}
			return nil
		})
		if out != nil {
			out["nodeId"] = nodeID
			out["summary"] = "Updated " + nodeID
		}
	case "delete_nodes":
		idsAny, _ := args["nodeIds"].([]any)
		ids := []string{}
		for _, v := range idsAny {
			if s, ok := v.(string); ok {
				ids = append(ids, s)
			}
		}
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Remove(ids, doc.Tombstones, design.Now())
			return nil
		})
		out["count"] = len(ids)
		out["summary"] = fmt.Sprintf("Deleted %d node(s)", len(ids))
	case "duplicate_node":
		nodeID := mcpStr(args, "nodeId")
		dx, _ := mcpNum(args, "offsetX")
		dy, _ := mcpNum(args, "offsetY")
		var newID string
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			n := page.Duplicate(nodeID, dx, dy)
			if n == nil {
				return fmt.Errorf("node %s not found", nodeID)
			}
			newID = n.ID
			return nil
		})
		if out != nil {
			out["nodeId"] = newID
			out["summary"] = "Duplicated " + nodeID
		}
	case "link_to_frame":
		nodeID := mcpStr(args, "nodeId")
		targetID := mcpStr(args, "targetFrameId")
		targetName := mcpStr(args, "targetFrameName")
		transition := mcpStr(args, "transition")
		if transition == "" {
			transition = "instant"
		}
		var targetPage, targetFrame string
		out, err = a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			n := page.Node(nodeID)
			if n == nil {
				return fmt.Errorf("node %s not found", nodeID)
			}
			var tp *design.Page
			var tf *design.Node
			if targetID != "" {
				for _, p := range doc.Pages {
					if candidate := p.Node(targetID); candidate != nil && candidate.Type == "frame" {
						tp, tf = p, candidate
						break
					}
				}
			} else if targetName != "" {
				tp, tf = doc.FindFrame(targetName)
			}
			if tp == nil || tf == nil {
				return fmt.Errorf("target frame not found")
			}
			n.Link = &design.Link{Action: "navigate", TargetPageID: tp.ID, TargetFrameID: tf.ID, Transition: transition}
			n.TS = design.Now()
			targetPage, targetFrame = tp.ID, tf.ID
			return nil
		})
		if out != nil {
			out["nodeId"] = nodeID
			out["pageId"] = targetPage
			out["summary"] = fmt.Sprintf("Linked %s → %s", nodeID, targetFrame)
		}
	}
	_ = recorder
	return out, err
}
