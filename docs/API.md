# API 参考

Base URL：`http://localhost:9000/api`

除公开端点外，使用：

```http
Authorization: Bearer <JWT>
```

MCP 也接受 `Authorization: Bearer sigma_pat_...`。

错误响应：

```json
{ "error": "message" }
```

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/auth/register` | `{name,email,password}` → `{token,user}` |
| `POST` | `/auth/login` | `{email,password}` → `{token,user}` |
| `GET` | `/auth/me` | 当前用户 |
| `PATCH` | `/users/me` | `{name,color,avatar}` 更新个人资料；头像必须是 `/api/uploads/...` |
| `GET` | `/auth/oidc/config` | `{enabled,label}`，公开 |
| `GET` | `/auth/oidc/login?returnTo=/` | 跳转 OIDC Provider，公开 |
| `GET` | `/auth/oidc/callback` | Provider 回调，公开 |
| `POST` | `/auth/oidc/exchange` | `{code}` → `{token,user,returnTo}`，公开 |

OIDC 使用 Authorization Code + PKCE + nonce。回调成功后前端用一次性 `oidc_code` 换取 JWT。

## 文件与文档

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/files` | 当前用户可见文件 |
| `POST` | `/files` | `{name,template}` 新建；模板 id 见 `/templates` |
| `GET/PATCH/DELETE` | `/files/{id}` | 详情 / 重命名、缩略图、收藏 / 删除 |
| `POST` | `/files/{id}/duplicate` | 复制文件 |
| `GET/PUT` | `/files/{id}/doc` | 读取 / 合并保存文档 |
| `GET/POST` | `/files/{id}/versions` | 版本列表 / 创建快照 |
| `POST` | `/files/{id}/versions/{versionId}/restore` | 恢复版本并广播 |
| `GET/POST` | `/files/{id}/comments` | 评论列表 / 新建 |
| `PATCH/DELETE` | `/comments/{id}` | 解决 / 删除评论 |
| `GET/POST/DELETE` | `/files/{id}/members` | 协作者管理 |
| `POST` | `/uploads` | 上传图片（≤10MB），`multipart/form-data` |
| `GET` | `/uploads/{name}` | 读取上传文件 |
| `GET/POST` | `/files/{id}/public-link` | 查询 / 开关公开原型（Owner） |
| `GET` | `/public/{token}` | 公开原型文档，无需登录 |
| `GET` | `/notifications` | 通知列表与未读数 |
| `POST` | `/notifications/read` | 全部已读 |
| `GET` | `/templates` | 模板元数据 |

## AI / BYOK

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/PUT` | `/ai/settings` | 读取 / 保存任意 OpenAI-compatible Provider、Base URL、Model、API Key |
| `POST` | `/ai/test` | 测试模型连接，返回延迟与回复 |
| `POST` | `/ai/chat` | `{fileId,pageId,message,sessionId?,selection?}` |
| `GET/PUT` | `/ai/context` | `{designMd,agentsMd}` |
| `GET` | `/ai/skills` | 自定义 Skills |
| `POST` | `/ai/skills` | `{filename,content}` 上传 SKILL.md |
| `DELETE` | `/ai/skills/{id}` | 删除 Skill |

`/ai/chat` 返回：

```json
{
  "reply": "Done!",
  "sessionId": "chat_...",
  "actions": [{ "tool": "create_frame", "summary": "...", "nodeId": "n_..." }],
  "doc": { "pages": [] },
  "version": 12
}
```

API Key 只在服务端解密使用；响应仅返回 `keyHint`（尾号）。

## PAT 与 MCP

### PAT

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/tokens` | 令牌列表（不含明文） |
| `POST` | `/tokens` | `{name,scopes,expiresInDays}` → 一次性返回明文 |
| `DELETE` | `/tokens/{id}` | 撤销 |

作用域：

- `mcp:read`：读取文件、页面、图层。
- `mcp:write`：创建 / 更新 / 删除 / 复制 / 链接。

PAT 明文格式 `sigma_pat_...`，只保存 SHA-256。PAT **只能**用于 `/api/mcp`，不能调用普通 REST。

### MCP

`POST /api/mcp`，JSON-RPC 2.0：

```bash
curl http://localhost:9000/api/mcp \
  -H "Authorization: Bearer sigma_pat_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

支持：

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

工具：

```text
list_files          get_file            list_pages
get_page            create_file         create_frame
create_rect         create_ellipse      create_vector
create_text         update_node         delete_nodes
duplicate_node      link_to_frame
```

Claude Desktop / Cursor 配置：

```json
{
  "mcpServers": {
    "sigma": {
      "type": "http",
      "url": "http://localhost:9000/api/mcp",
      "headers": { "Authorization": "Bearer sigma_pat_..." }
    }
  }
}
```

无 `mcp:read` 时 `tools/list` 返回 JSON-RPC `-32001`；无 `mcp:write` 时写工具返回 `isError: true`。

## Figma

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/figma/import` | `{url,token,name?}`，通过 Figma REST API 导入 |
| `POST` | `/figma/import-json` | 原始 JSON：Sigma 文档 / 包装对象 / Figma REST 响应 |
| `GET` | `/files/{id}/figma-json` | 下载 `{format:"sigma-figma-v1",name,doc}` |

`/figma/import-json?name=...` 支持：

- `{format:"sigma-figma-v1", name, doc}`
- 原始 Sigma 文档 `{pages:[...]}`
- Figma REST 文件响应 `{document:{...}}`

## 系统 / 自动更新

这三个端点只允许 `SIGMA_ADMIN_EMAILS` 中的实例管理员访问；普通登录用户返回 `403`。普通用户不应能触发二进制替换或服务重启。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/system/update` | 当前版本、最新版本、间隔、最近检查、错误（仅管理员） |
| `POST` | `/system/update/check` | 立即检查（仅管理员） |
| `POST` | `/system/update/apply` | 下载、校验并替换，随后重启（仅管理员） |

状态示例：

```json
{
  "currentVersion": "1.4.0",
  "latestVersion": "1.4.1",
  "updateAvailable": true,
  "autoUpdate": true,
  "interval": "10m0s",
  "lastChecked": "2026-10-22T09:00:00Z",
  "lastError": "",
  "restartPending": false,
  "repo": "holihur/sigma",
  "asset": "sigma-linux-amd64"
}
```

## WebSocket

```text
GET /api/ws?fileId=<id>&token=<JWT>&clientId=<random>
```

消息：

- `presence`：光标、选区、在线用户。
- `delta`：节点 / 页面 / 墓碑增量。
- `doc-delta`：服务端权威增量广播。
- `comment`：新评论通知。

断线后客户端降级 HTTP 保存，并在重连时补拉。

## 健康检查

```text
GET /api/health
{"ok":true,"time":"..."}
```
