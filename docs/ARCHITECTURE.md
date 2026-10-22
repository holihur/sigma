# 架构与数据模型

## 总览

Sigma 是单体 Go 服务 + React SPA：

```text
Browser
  ├─ REST /api/*                 JSON API
  ├─ WebSocket /api/ws           presence + delta sync
  └─ MCP /api/mcp                JSON-RPC, PAT or JWT
        │
        ▼
Go net/http
  ├─ internal/api                 HTTP handlers, AI tools, MCP, Figma
  ├─ internal/doc                 document merge / delta / restore
  ├─ internal/design              canvas document model + helpers
  ├─ internal/auth                JWT, bcrypt, OIDC, PAT
  ├─ internal/store               SQLite persistence
  ├─ internal/ws                  collaboration hub
  ├─ internal/ai                  DeepSeek OpenAI-compatible ADK model
  ├─ internal/update              GitHub release self-update
  └─ internal/static              optional embedded frontend
        │
        ▼
SQLite + uploads/                 single-node deployment
```

前端位于 `frontend/`：React 19、Vite 7、Tailwind CSS 4、Radix/shadcn 风格组件、zustand。构建产物可放在 `STATIC_DIR`，也可通过 `-tags embed_static` 编进二进制。

## 目录

```text
sigma/
├── backend/
│   ├── main.go
│   └── internal/
│       ├── ai/            DeepSeek ADK model + API key crypto
│       ├── api/           REST / MCP / AI / Figma / OIDC handlers
│       ├── auth/          JWT, password, OIDC, PAT
│       ├── design/        canvas doc model
│       ├── doc/           merge, delta, restore
│       ├── figma/         Figma REST converter
│       ├── static/        optional embedded frontend
│       ├── store/         SQLite schema + queries
│       ├── templates/     embedded template JSON
│       ├── update/        release checker / self updater
│       └── ws/            WebSocket hub
├── frontend/
│   ├── scripts/gen-templates.ts
│   └── src/
│       ├── components/editor/
│       ├── hooks/useCollaboration.ts
│       ├── lib/           types, geometry, merge, delta, API
│       ├── pages/
│       └── store/
├── figma-plugin/          Sigma → Figma development plugin
├── deploy/                example systemd units
├── docs/
├── install.sh
├── uninstall.sh
├── .goreleaser.yaml
└── docker-compose.yml
```

## 文档模型

```ts
SigmaDoc {
  pages: Page[]
  tombstones: Record<nodeId, timestamp>
  deletedPages: Record<pageId, timestamp>
}

Page {
  id, name, nodes: Record<id, SceneNode>, rootIds: string[], ts
}

SceneNode {
  id, type, name, x, y, width, height, rotation, opacity, visible, locked
  fill, stroke, strokeWidth, radius, shadow, blur
  children, parentId, clip
  text, fontSize, fontFamily, fontWeight, lineHeight, letterSpacing, textAlign, verticalAlign
  src, objectFit, link
  points, closed                 // vector
  component, componentId         // components
  ts
}
```

节点坐标为父节点局部坐标。`group` 是零原点容器，AABB 由子节点计算。矢量点 `points` 归一化到 `0..1`，因此缩放节点时路径会随之缩放。

## 协作合并

没有引入 CRDT 库，而是针对原型文档实现节点级 LWW：

1. 每个节点带 `ts`，每次修改更新 `ts`。
2. 删除节点写 `tombstones[nodeId]`；删除页面写 `deletedPages[pageId]`。
3. 前端 650ms 防抖，将当前文档与上次发送版本 diff，只发送变化的页面 / 节点 / 墓碑。
4. 后端合并 delta，递增文件版本，写 SQLite，再将权威 delta 广播给房间。
5. 前端收到广播后再次合并，本地未发送修改不会被覆盖。
6. 断线时降级为 `PUT /api/files/{id}/doc`；重连先补拉再发送本地修改。
7. 撤销 / 重做把快照与当前文档 diff：修改节点提升 `ts`，消失节点补墓碑，避免撤销后被服务器复活。
8. 版本恢复提升快照内所有节点 `ts`，并为当前存在但快照中不存在的节点写墓碑。

presence（光标、选区）走独立 WebSocket 消息，约 45ms 节流，不持久化。

## 增量同步

`frontend/src/lib/delta.ts` 的 `diffDocs` 生成只包含变化页面的 delta。WebSocket 消息类型为 `delta`，后端 `applyDelta` 调用 `doc.ApplyDelta` 并广播 `doc-delta`。

持久化仍重写整份文档 JSON；目前目标是单机 SQLite，足够支撑中小团队。若需要大规模协作，可替换为操作日志 / CRDT，但 LWW 模型已经是显式边界。

## 矢量路径

- 类型 `vector`，`points: {x,y,in?,out?}[]` 为单位坐标，`closed` 控制闭合。
- 每个锚点可选 `in` / `out` 贝塞尔控制柄；段渲染为 `C`，无控制柄时为 `L`。
- 钢笔拖拽生成对称控制柄，拖动锚点会带动控制柄；平滑 / 尖角、双击插点、`Alt` 删除锚点。
- 矩形 / 椭圆 / 直线可转换为矢量；椭圆使用 4 段三次贝塞尔近似。
- 渲染用 `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">`，配合 `vector-effect="non-scaling-stroke"`，缩放时线宽保持稳定。
- 后端 `design.Node` 保存同样字段，AI / MCP 可创建矢量，Figma 插件导出为 Figma Vector。

## 组件实例

- 主组件：`component=true` 的普通节点。
- 实例：`componentId=<main id>` 的克隆子树。
- 插入实例时深拷贝组件子树并生成新 ID，保留根节点位置偏移。
- 修改主组件内部属性时，`updateNodes` 向上查找 `component=true` 祖先并调用 `syncInstances`，重建所有实例子树；删除的旧节点写墓碑。
- 手动操作（新增 / 删除图层）后可在组件库点击 **Update instances**。
- 分离实例只清除 `componentId`，保留当前子树。

## 个人资料

- `users.avatar` 保存 `/api/uploads/...` URL；用户通过现有上传接口上传头像。
- `PATCH /api/users/me` 更新 `name`、`color`、`avatar`；头像只接受本实例上传路径。
- 评论、协作者、通知查询 JOIN `users`，所以改名 / 换头像后历史内容也会显示新资料。

## 上传与图片

- `POST /api/uploads` 接收 PNG / JPG / GIF / WebP，≤10MB，随机文件名写入 `UPLOAD_DIR`。
- 文档只保存 `/api/uploads/<name>` URL，不再塞 data URL。
- 缩略图仍是压缩后的 data URL，存在 `files.thumbnail`，便于文件面板快速展示。

## AI / Agent 层

- `internal/ai/openai.go` 实现 ADK `model.LLM`，把 `genai.Content` / tools / tool calls 映射到 OpenAI Chat Completions。
- `internal/api/ai_handlers.go` 构建 `llmagent`，注入服务端状态 `fileId/pageId/userId`，模型不能指定其他文件。
- 设计工具直接操作 `design.Doc`，保存时递增版本并通过 WebSocket 广播。
- 自定义 Skills 通过 `skilltoolset` 适配 `dbSkillSource`，数据来自 `ai_skills` 表。
- 更多见 [AI-AGENTS.md](AI-AGENTS.md)。

## 安全边界

- JWT 30 天有效，HS256，`SIGMA_SECRET` 签名。
- BYOK API Key 用 `SIGMA_SECRET` 派生 AES-256-GCM 加密。
- PAT 只存 SHA-256，明文只显示一次；PAT 只在 `/api/mcp` 接受，作用域 `mcp:read` / `mcp:write`。
- OIDC 使用 Authorization Code + PKCE + nonce；一次性交换码 2 分钟有效。
- 文件访问统一走 `accessRole(fileId, user)`：owner / edit / view。
- 上传限制 10MB；JSON 导入限制 96MB；AI 消息 4000 字符。
- Figma Token 只用于一次导入，不落库。

## 测试

- `internal/design`：节点增删改、Frame 查找、矢量 / 组件字段。
- `internal/doc`：LWW、墓碑、恢复、delta。
- `internal/ai`：OpenAI 内容 / tools 映射、Key 加密。
- `internal/api`：ADK 工具调用、MCP、PAT 作用域、Figma 导入导出、OIDC（mock provider）、上下文与 Skills。
- `internal/update`：版本比较、Release 解析、校验和。
- `internal/templates`：嵌入模板 JSON 有效性。
- CI：`go vet ./...`、`go test ./...`、`go build ./...`、`pnpm build`。
