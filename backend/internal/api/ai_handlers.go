package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/model"
	"google.golang.org/adk/runner"
	"google.golang.org/adk/session"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
	"google.golang.org/adk/tool/skilltoolset"
	"google.golang.org/genai"

	"sigma/internal/ai"
	"sigma/internal/design"
	appmodel "sigma/internal/model"
	"sigma/internal/store"
)

type aiSettingsResponse struct {
	Configured bool   `json:"configured"`
	Provider   string `json:"provider"`
	BaseURL    string `json:"baseUrl"`
	Model      string `json:"model"`
	KeyHint    string `json:"keyHint"`
	UpdatedAt  string `json:"updatedAt"`
}

func (a *API) loadAISettings(userID string) (store.AISettingsRecord, string, error) {
	rec, err := a.st.AISettings(userID)
	if err != nil {
		if store.ErrNotFound(err) {
			return store.AISettingsRecord{
				UserID: userID, Provider: ai.DefaultProvider,
				BaseURL: ai.DefaultBaseURL, Model: ai.DefaultModel,
			}, "", nil
		}
		return rec, "", err
	}
	key, err := ai.DecryptAPIKey(a.secret, rec.APIKeyEnc)
	if err != nil {
		return rec, "", fmt.Errorf("stored API key cannot be decrypted; please re-enter it")
	}
	return rec, key, nil
}

func settingsResponse(rec store.AISettingsRecord, key string) aiSettingsResponse {
	hint := ""
	if len(key) >= 4 {
		hint = "••••" + key[len(key)-4:]
	} else if key != "" {
		hint = "••••"
	}
	return aiSettingsResponse{
		Configured: key != "",
		Provider:   rec.Provider,
		BaseURL:    rec.BaseURL,
		Model:      rec.Model,
		KeyHint:    hint,
		UpdatedAt:  rec.UpdatedAt,
	}
}

func (a *API) handleAISettings(w http.ResponseWriter, r *http.Request, u appmodel.User) {
	rec, key, err := a.loadAISettings(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settingsResponse(rec, key))
}

func (a *API) handleSetAISettings(w http.ResponseWriter, r *http.Request, u appmodel.User) {
	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"baseUrl"`
		Model    string `json:"model"`
		APIKey   string `json:"apiKey"`
		ClearKey bool   `json:"clearKey"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	rec, _, err := a.loadAISettings(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if strings.TrimSpace(body.Provider) != "" {
		rec.Provider = strings.TrimSpace(body.Provider)
	}
	if strings.TrimSpace(body.BaseURL) != "" {
		rec.BaseURL = strings.TrimRight(strings.TrimSpace(body.BaseURL), "/")
	}
	if strings.TrimSpace(body.Model) != "" {
		rec.Model = strings.TrimSpace(body.Model)
	}
	if rec.Provider == "" {
		rec.Provider = ai.DefaultProvider
	}
	if rec.BaseURL == "" {
		rec.BaseURL = ai.DefaultBaseURL
	}
	if rec.Model == "" {
		rec.Model = ai.DefaultModel
	}
	if !strings.HasPrefix(rec.BaseURL, "http://") && !strings.HasPrefix(rec.BaseURL, "https://") {
		writeError(w, http.StatusBadRequest, "Base URL must start with http:// or https://")
		return
	}
	if body.ClearKey {
		rec.APIKeyEnc = ""
	} else if strings.TrimSpace(body.APIKey) != "" {
		enc, err := ai.EncryptAPIKey(a.secret, strings.TrimSpace(body.APIKey))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not protect API key")
			return
		}
		rec.APIKeyEnc = enc
	}
	if err := a.st.SaveAISettings(rec); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save AI settings")
		return
	}
	rec, key, _ := a.loadAISettings(u.ID)
	writeJSON(w, http.StatusOK, settingsResponse(rec, key))
}

func (a *API) handleTestAI(w http.ResponseWriter, r *http.Request, u appmodel.User) {
	rec, key, err := a.loadAISettings(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if key == "" {
		writeError(w, http.StatusBadRequest, "Add a DeepSeek API key first")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	mdl := ai.NewOpenAICompatibleModel(ai.Config{APIKey: key, BaseURL: rec.BaseURL, Model: rec.Model})
	start := time.Now()
	temp := float32(0)
	req := &model.LLMRequest{
		Contents: []*genai.Content{genai.NewContentFromText("Reply with exactly: OK", genai.RoleUser)},
		Config:   &genai.GenerateContentConfig{MaxOutputTokens: 8, Temperature: &temp},
	}
	text := ""
	var runErr error
	for resp, err := range mdl.GenerateContent(ctx, req, false) {
		if err != nil {
			runErr = err
			break
		}
		if resp != nil && resp.Content != nil {
			for _, part := range resp.Content.Parts {
				if part.Text != "" {
					text += part.Text
				}
			}
		}
	}
	if runErr != nil {
		writeError(w, http.StatusBadGateway, runErr.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "latencyMs": time.Since(start).Milliseconds(),
		"model": rec.Model, "reply": strings.TrimSpace(text),
	})
}

type agentActionRecorder struct {
	mu      sync.Mutex
	actions []map[string]any
}

func (r *agentActionRecorder) add(name string, result map[string]any) {
	entry := map[string]any{"tool": name}
	for k, v := range result {
		if k == "summary" || k == "nodeId" || k == "ok" || k == "pageId" || k == "count" {
			entry[k] = v
		}
	}
	if _, ok := entry["summary"]; !ok {
		entry["summary"] = name
	}
	r.mu.Lock()
	r.actions = append(r.actions, entry)
	r.mu.Unlock()
}

func (r *agentActionRecorder) snapshot() []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]map[string]any{}, r.actions...)
}

const (
	aiStateFileID = "sigma.fileId"
	aiStatePageID = "sigma.pageId"
	aiStateUserID = "sigma.userId"
)

func toolState(ctx agent.ToolContext) (fileID, pageID, userID string, err error) {
	get := func(key string) string {
		v, e := ctx.State().Get(key)
		if e != nil {
			return ""
		}
		s, _ := v.(string)
		return s
	}
	fileID = get(aiStateFileID)
	pageID = get(aiStatePageID)
	userID = get(aiStateUserID)
	if fileID == "" || userID == "" {
		return "", "", "", fmt.Errorf("design context is missing")
	}
	return fileID, pageID, userID, nil
}

func (a *API) handleAIChat(w http.ResponseWriter, r *http.Request, u appmodel.User) {
	var body struct {
		FileID    string   `json:"fileId"`
		PageID    string   `json:"pageId"`
		Message   string   `json:"message"`
		SessionID string   `json:"sessionId"`
		Selection []string `json:"selection"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}
	body.Message = strings.TrimSpace(body.Message)
	if body.Message == "" {
		writeError(w, http.StatusBadRequest, "Message cannot be empty")
		return
	}
	if len([]rune(body.Message)) > 4000 {
		writeError(w, http.StatusBadRequest, "Message is too long")
		return
	}
	role := a.accessRole(body.FileID, u)
	if role != "owner" && role != "edit" {
		writeError(w, http.StatusForbidden, "You need edit access to use the design agent")
		return
	}
	f, err := a.st.File(body.FileID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Design not found")
		return
	}
	doc, err := design.Parse(f.Doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read design")
		return
	}
	page := doc.Page(body.PageID)
	if page == nil {
		writeError(w, http.StatusBadRequest, "Page not found")
		return
	}
	rec, key, err := a.loadAISettings(u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if key == "" {
		writeError(w, http.StatusBadRequest, "Add your DeepSeek API key in AI settings first")
		return
	}

	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		sessionID = newID("chat")
	}
	state := map[string]any{
		aiStateFileID: body.FileID,
		aiStatePageID: page.ID,
		aiStateUserID: u.ID,
	}
	if _, err := a.aiSessions.Get(r.Context(), &session.GetRequest{AppName: "sigma", UserID: u.ID, SessionID: sessionID}); err != nil {
		if _, err := a.aiSessions.Create(r.Context(), &session.CreateRequest{
			AppName: "sigma", UserID: u.ID, SessionID: sessionID, State: state,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not start AI session")
			return
		}
	}

	recorder := &agentActionRecorder{}
	tools, err := a.designAgentTools(recorder)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not initialize design tools")
		return
	}
	mdl := ai.NewOpenAICompatibleModel(ai.Config{APIKey: key, BaseURL: rec.BaseURL, Model: rec.Model})
	instruction := fmt.Sprintf(`You are Sigma, an AI product designer working inside a collaborative prototyping canvas.
You can inspect and edit the current page using the provided tools. Always use tools for changes; never claim changes you did not make.
Rules:
- Coordinates are CSS pixels relative to the parent frame. Frames clip their children.
- To build a screen, create a frame first, then create text/rect/ellipse nodes with parentId set to that frame.
- Create polished layouts with a clear hierarchy: heading, supporting text, content, primary action.
- Use hex colors. Default brand color is #0ea5e9 (sky blue). Ensure readable contrast.
- Call get_design when you need existing node IDs or page context. Never invent node IDs.
- Use link_to_frame when the user asks for a prototype interaction.
- Keep the final response short and in the same language as the user.
Current file: %s
Current page: %s (%s)
Selected node ids: %s`, f.Name, page.Name, page.ID, strings.Join(body.Selection, ", "))

	ctxRec, ctxErr := a.st.AIContext(u.ID)
	if ctxErr == nil {
		instruction = appendAgentDoc(instruction, "Design.md", ctxRec.DesignMD)
		instruction = appendAgentDoc(instruction, "AGENTS.md", ctxRec.AgentsMD)
	}
	skillRecords, _ := a.st.ListSkills(u.ID)
	toolsets := []tool.Toolset{}
	if len(skillRecords) > 0 {
		ts, tsErr := skilltoolset.New(r.Context(), skilltoolset.Config{Source: &dbSkillSource{records: skillRecords}})
		if tsErr != nil {
			writeError(w, http.StatusInternalServerError, "Could not load custom skills: "+tsErr.Error())
			return
		}
		toolsets = append(toolsets, ts)
		instruction += "\n\nCustom skills are available. If one is relevant, you MUST call list_skills and load_skill before proceeding."
	}
	ag, err := llmagent.New(llmagent.Config{
		Name:        "sigma_designer",
		Description: "Edits Sigma design documents through structured tools.",
		Model:       mdl,
		Instruction: instruction,
		Tools:       tools,
		Toolsets:    toolsets,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not initialize agent")
		return
	}
	runtime, err := runner.New(runner.Config{
		AppName: "sigma", Agent: ag, SessionService: a.aiSessions, AutoCreateSession: true,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not initialize agent runtime")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 150*time.Second)
	defer cancel()
	msg := genai.NewContentFromText(body.Message, genai.RoleUser)
	replyParts := []string{}
	var runErr error
	for ev, evErr := range runtime.Run(ctx, u.ID, sessionID, msg, agent.RunConfig{StreamingMode: agent.StreamingModeNone},
		runner.WithStateDelta(state)) {
		if evErr != nil {
			runErr = evErr
			break
		}
		if ev == nil || ev.Content == nil {
			continue
		}
		for _, part := range ev.Content.Parts {
			if part.Text != "" {
				replyParts = append(replyParts, part.Text)
			}
		}
	}
	if runErr != nil {
		writeError(w, http.StatusBadGateway, runErr.Error())
		return
	}
	reply := strings.TrimSpace(strings.Join(replyParts, "\n"))
	if reply == "" {
		reply = "Done."
	}
	latest, err := a.st.File(body.FileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not reload design")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"reply": reply, "sessionId": sessionID,
		"actions": recorder.snapshot(),
		"doc":     json.RawMessage(latest.Doc),
		"version": latest.Version,
	})
}

func appendAgentDoc(instruction, name, content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return instruction
	}
	runes := []rune(content)
	if len(runes) > 12000 {
		content = string(runes[:12000]) + "\n… (truncated)"
	}
	return instruction + "\n\n## " + name + "\n" + content
}

// ---------- design tools ----------

func (a *API) designAgentTools(recorder *agentActionRecorder) ([]tool.Tool, error) {
	getDesign, err := functiontool.New(functiontool.Config{
		Name: "get_design", Description: "Read the current page, its nodes, positions, text, fills and prototype links.",
	}, func(ctx agent.ToolContext, args struct{}) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		f, err := a.st.File(fileID)
		if err != nil {
			return nil, err
		}
		doc, err := design.Parse(f.Doc)
		if err != nil {
			return nil, err
		}
		return doc.Summary(pageID), nil
	})
	if err != nil {
		return nil, err
	}

	createFrame, err := functiontool.New(functiontool.Config{
		Name: "create_frame", Description: "Create a frame (artboard/container). Coordinates are relative to parentId or the page.",
	}, func(ctx agent.ToolContext, args createFrameArgs) (map[string]any, error) {
		return a.agentCreateNode(ctx, "frame", args.Name, args.X, args.Y, args.Width, args.Height, args.Fill, args.Radius, args.ParentID, recorder)
	})
	if err != nil {
		return nil, err
	}
	createRect, err := functiontool.New(functiontool.Config{
		Name: "create_rect", Description: "Create a rectangle layer. Use for cards, buttons, backgrounds and dividers.",
	}, func(ctx agent.ToolContext, args createShapeArgs) (map[string]any, error) {
		return a.agentCreateNode(ctx, "rect", args.Name, args.X, args.Y, args.Width, args.Height, args.Fill, args.Radius, args.ParentID, recorder)
	})
	if err != nil {
		return nil, err
	}
	createEllipse, err := functiontool.New(functiontool.Config{
		Name: "create_ellipse", Description: "Create an ellipse/avatar/decoration layer.",
	}, func(ctx agent.ToolContext, args createShapeArgs) (map[string]any, error) {
		return a.agentCreateNode(ctx, "ellipse", args.Name, args.X, args.Y, args.Width, args.Height, args.Fill, args.Radius, args.ParentID, recorder)
	})
	if err != nil {
		return nil, err
	}
	createVector, err := functiontool.New(functiontool.Config{
		Name: "create_vector", Description: "Create an editable vector path. Points are normalized 0..1 inside the node box; use for icons, arrows and custom shapes.",
	}, func(ctx agent.ToolContext, args createVectorArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		if args.Width <= 0 {
			args.Width = 100
		}
		if args.Height <= 0 {
			args.Height = 100
		}
		node := design.NewNode("vector", args.Name, args.X, args.Y, args.Width, args.Height)
		for _, p := range args.Points {
			node.Points = append(node.Points, design.VectorPoint{X: clamp01(p.X), Y: clamp01(p.Y)})
		}
		if len(node.Points) == 0 {
			node.Points = []design.VectorPoint{{X: 0.5, Y: 0}, {X: 1, Y: 1}, {X: 0, Y: 1}}
			args.Closed = true
		}
		node.Closed = args.Closed
		if args.Fill != "" {
			node.Fill = design.Solid(args.Fill)
		}
		if args.Stroke != "" {
			node.Stroke = design.Solid(args.Stroke)
		}
		if args.StrokeWidth > 0 {
			node.StrokeWidth = args.StrokeWidth
		}
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Add(node, args.ParentID, -1)
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("create_vector", res)
		res["nodeId"] = node.ID
		res["summary"] = "Created vector " + node.ID
		return res, nil
	})
	if err != nil {
		return nil, err
	}
	createText, err := functiontool.New(functiontool.Config{
		Name: "create_text", Description: "Create a text layer. Coordinates are relative to parentId.",
	}, func(ctx agent.ToolContext, args createTextArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		width := args.Width
		if width <= 0 {
			width = 320
		}
		height := args.Height
		if height <= 0 {
			height = 40
		}
		node := design.NewNode("text", args.Name, args.X, args.Y, width, height)
		node.Text = args.Text
		if args.FontSize > 0 {
			node.FontSize = args.FontSize
		}
		if args.FontWeight > 0 {
			node.FontWeight = args.FontWeight
		}
		if args.Color != "" {
			node.Fill = design.Solid(args.Color)
		}
		if args.TextAlign != "" {
			node.TextAlign = args.TextAlign
		}
		if args.LineHeight > 0 {
			node.LineHeight = args.LineHeight
		}
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Add(node, args.ParentID, -1)
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("create_text", res)
		res["summary"] = "Created text: " + design.TruncateText(args.Text, 40)
		res["text"] = args.Text
		return res, nil
	})
	if err != nil {
		return nil, err
	}
	updateNode, err := functiontool.New(functiontool.Config{
		Name: "update_node", Description: "Update an existing node by id: position, size, fill, text, font, opacity or radius.",
	}, func(ctx agent.ToolContext, args updateNodeArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			patch := design.Patch{
				Name: args.Name, X: args.X, Y: args.Y, Width: args.Width, Height: args.Height,
				Rotation: args.Rotation, Opacity: args.Opacity, Radius: args.Radius,
				Fill: args.Fill, Text: args.Text, FontSize: args.FontSize,
				FontWeight: args.FontWeight, LineHeight: args.LineHeight,
				LetterSpacing: args.LetterSpacing, TextAlign: args.TextAlign, Visible: args.Visible,
			}
			if _, ok := page.Update(args.NodeID, patch); !ok {
				return fmt.Errorf("node %s not found", args.NodeID)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("update_node", res)
		res["nodeId"] = args.NodeID
		res["summary"] = "Updated node " + args.NodeID
		return res, nil
	})
	if err != nil {
		return nil, err
	}
	deleteNodes, err := functiontool.New(functiontool.Config{
		Name: "delete_nodes", Description: "Delete one or more nodes and their children by id.",
	}, func(ctx agent.ToolContext, args deleteNodesArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			page.Remove(args.NodeIDs, doc.Tombstones, design.Now())
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("delete_nodes", res)
		res["count"] = len(args.NodeIDs)
		res["summary"] = fmt.Sprintf("Deleted %d node(s)", len(args.NodeIDs))
		return res, nil
	})
	if err != nil {
		return nil, err
	}
	duplicateNode, err := functiontool.New(functiontool.Config{
		Name: "duplicate_node", Description: "Duplicate a node and its children with an optional pixel offset.",
	}, func(ctx agent.ToolContext, args duplicateNodeArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		var newNodeID string
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			n := page.Duplicate(args.NodeID, args.OffsetX, args.OffsetY)
			if n == nil {
				return fmt.Errorf("node %s not found", args.NodeID)
			}
			newNodeID = n.ID
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("duplicate_node", res)
		res["nodeId"] = newNodeID
		res["summary"] = "Duplicated node " + args.NodeID
		return res, nil
	})
	if err != nil {
		return nil, err
	}
	linkToFrame, err := functiontool.New(functiontool.Config{
		Name: "link_to_frame", Description: "Add a click-through prototype link from a node to a target frame.",
	}, func(ctx agent.ToolContext, args linkToFrameArgs) (map[string]any, error) {
		fileID, pageID, _, err := toolState(ctx)
		if err != nil {
			return nil, err
		}
		var targetPage, targetFrame string
		res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
			n := page.Node(args.NodeID)
			if n == nil {
				return fmt.Errorf("node %s not found", args.NodeID)
			}
			tp := doc.Page(args.TargetPageID)
			var tf *design.Node
			if args.TargetFrameID != "" {
				for _, p := range doc.Pages {
					if n2 := p.Node(args.TargetFrameID); n2 != nil && n2.Type == "frame" {
						tp, tf = p, n2
						break
					}
				}
			} else if args.TargetFrameName != "" {
				tp, tf = doc.FindFrame(args.TargetFrameName)
			}
			if tp == nil || tf == nil {
				return fmt.Errorf("target frame not found")
			}
			transition := args.Transition
			if transition == "" {
				transition = "instant"
			}
			n.Link = &design.Link{Action: "navigate", TargetPageID: tp.ID, TargetFrameID: tf.ID, Transition: transition}
			n.TS = design.Now()
			targetPage, targetFrame = tp.ID, tf.ID
			return nil
		})
		if err != nil {
			return nil, err
		}
		recorder.add("link_to_frame", res)
		res["nodeId"] = args.NodeID
		res["pageId"] = targetPage
		res["summary"] = fmt.Sprintf("Linked %s → %s", args.NodeID, targetFrame)
		return res, nil
	})
	if err != nil {
		return nil, err
	}

	return []tool.Tool{getDesign, createFrame, createRect, createEllipse, createVector, createText, updateNode, deleteNodes, duplicateNode, linkToFrame}, nil
}

func (a *API) agentMutate(fileID, pageID string, fn func(*design.Doc, *design.Page) error) (map[string]any, error) {
	lock := a.fileLock(fileID)
	lock.Lock()
	defer lock.Unlock()
	f, err := a.st.File(fileID)
	if err != nil {
		return nil, err
	}
	doc, err := design.Parse(f.Doc)
	if err != nil {
		return nil, err
	}
	page := doc.Page(pageID)
	if page == nil {
		return nil, fmt.Errorf("page not found")
	}
	if err := fn(doc, page); err != nil {
		return nil, err
	}
	raw, err := doc.Marshal()
	if err != nil {
		return nil, err
	}
	version := f.Version + 1
	if err := a.st.SaveDoc(fileID, string(raw), version); err != nil {
		return nil, err
	}
	a.hub.BroadcastDoc(fileID, raw, version)
	return map[string]any{"ok": true, "pageId": page.ID, "version": version, "nodeCount": len(page.Nodes)}, nil
}

type createFrameArgs struct {
	Name     string  `json:"name"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	Fill     string  `json:"fill,omitempty"`
	Radius   float64 `json:"radius,omitempty"`
	ParentID string  `json:"parentId,omitempty"`
}

type createShapeArgs struct {
	Name     string  `json:"name,omitempty"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	Fill     string  `json:"fill,omitempty"`
	Radius   float64 `json:"radius,omitempty"`
	ParentID string  `json:"parentId,omitempty"`
}

type createTextArgs struct {
	Name       string  `json:"name,omitempty"`
	Text       string  `json:"text"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width,omitempty"`
	Height     float64 `json:"height,omitempty"`
	FontSize   float64 `json:"fontSize,omitempty"`
	FontWeight int     `json:"fontWeight,omitempty"`
	LineHeight float64 `json:"lineHeight,omitempty"`
	Color      string  `json:"color,omitempty"`
	TextAlign  string  `json:"textAlign,omitempty"`
	ParentID   string  `json:"parentId,omitempty"`
}

type vectorPointArg struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type createVectorArgs struct {
	Name        string           `json:"name,omitempty"`
	X           float64          `json:"x"`
	Y           float64          `json:"y"`
	Width       float64          `json:"width,omitempty"`
	Height      float64          `json:"height,omitempty"`
	Points      []vectorPointArg `json:"points,omitempty"`
	Closed      bool             `json:"closed,omitempty"`
	Fill        string           `json:"fill,omitempty"`
	Stroke      string           `json:"stroke,omitempty"`
	StrokeWidth float64          `json:"strokeWidth,omitempty"`
	ParentID    string           `json:"parentId,omitempty"`
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

type updateNodeArgs struct {
	NodeID        string   `json:"nodeId"`
	Name          *string  `json:"name,omitempty"`
	X             *float64 `json:"x,omitempty"`
	Y             *float64 `json:"y,omitempty"`
	Width         *float64 `json:"width,omitempty"`
	Height        *float64 `json:"height,omitempty"`
	Rotation      *float64 `json:"rotation,omitempty"`
	Opacity       *float64 `json:"opacity,omitempty"`
	Radius        *float64 `json:"radius,omitempty"`
	Fill          *string  `json:"fill,omitempty"`
	Text          *string  `json:"text,omitempty"`
	FontSize      *float64 `json:"fontSize,omitempty"`
	FontWeight    *int     `json:"fontWeight,omitempty"`
	LineHeight    *float64 `json:"lineHeight,omitempty"`
	LetterSpacing *float64 `json:"letterSpacing,omitempty"`
	TextAlign     *string  `json:"textAlign,omitempty"`
	Visible       *bool    `json:"visible,omitempty"`
}

type deleteNodesArgs struct {
	NodeIDs []string `json:"nodeIds"`
}

type duplicateNodeArgs struct {
	NodeID  string  `json:"nodeId"`
	OffsetX float64 `json:"offsetX,omitempty"`
	OffsetY float64 `json:"offsetY,omitempty"`
}

type linkToFrameArgs struct {
	NodeID          string `json:"nodeId"`
	TargetFrameID   string `json:"targetFrameId,omitempty"`
	TargetFrameName string `json:"targetFrameName,omitempty"`
	TargetPageID    string `json:"targetPageId,omitempty"`
	Transition      string `json:"transition,omitempty"`
}

func (a *API) agentCreateNode(ctx agent.ToolContext, typ, name string, x, y, w, h float64, fill string, radius float64, parentID string, recorder *agentActionRecorder) (map[string]any, error) {
	fileID, pageID, _, err := toolState(ctx)
	if err != nil {
		return nil, err
	}
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
	res, err := a.agentMutate(fileID, pageID, func(doc *design.Doc, page *design.Page) error {
		page.Add(node, parentID, -1)
		return nil
	})
	if err != nil {
		return nil, err
	}
	recorder.add("create_"+typ, res)
	res["nodeId"] = node.ID
	res["summary"] = "Created " + typ + " " + node.ID
	return res, nil
}
