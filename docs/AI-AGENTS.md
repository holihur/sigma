# AI Agent 与 Skills

## BYOK

每位用户使用自己的模型 Key：

1. 编辑器 → 顶栏 **Sigma AI** → 设置。
2. 选择 Provider 预设（DeepSeek / OpenAI / Gemini / OpenRouter / Groq / Mistral / xAI / Together / Ollama / 自定义），或直接填写任意 OpenAI-compatible Base URL 与 Model。
3. 输入 API Key → **Save & test**。
4. Key 使用 `SIGMA_SECRET` 派生 AES-256-GCM 加密，写入 `ai_settings.api_key_enc`。
5. API 响应只返回 `••••` 尾号；日志与数据库都不保存明文。

默认仍为 `deepseek-v4.1-flash`，但不锁定服务商。只要实现 OpenAI-compatible `/chat/completions` 与 function calling，就可以接入。内置预设包括 OpenAI、Google Gemini、OpenRouter、Groq、Mistral、xAI、Together、Ollama 等。

## Agent 如何改设计

```text
User message
   │
   ▼
Go ADK llmagent
   ├─ system instruction（含 Design.md / AGENTS.md）
   ├─ design tools（get/create/update/delete/duplicate/link）
   └─ optional skill toolset（list_skills / load_skill）
   │
   ▼
tool call ──► design.Doc mutation ──► MongoDB + WebSocket broadcast
   │
   ▼
Final text + action chips + new doc version
```

服务端在每次请求注入：

```text
sigma.fileId
sigma.pageId
sigma.userId
```

模型只能操作当前文件 / 页面，无法通过参数越权。

## 服务商预设

| Provider | Base URL | 示例模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4.1-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| xAI | `https://api.x.ai/v1` | `grok-3-mini` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Ollama / local | `http://localhost:11434/v1` | `llama3.1` |
| Custom | 任意 `/v1` | 任意模型 ID |

自定义服务商需要支持 OpenAI Chat Completions 和 function calling。模型 ID 与 Base URL 由用户控制，Sigma 不把服务商写死。

## 设计工具

| 工具 | 说明 |
| --- | --- |
| `get_design` | 读取当前页面结构、文本、颜色、链接 |
| `create_frame` | 创建画板 |
| `create_rect` | 创建卡片 / 按钮 / 背景 |
| `create_ellipse` | 创建圆形 / 头像 / 装饰 |
| `create_vector` | 创建归一化矢量路径 |
| `create_text` | 创建文本，支持字体、字号、对齐 |
| `update_node` | 修改位置、尺寸、填充、文本、透明度、圆角、旋转 |
| `delete_nodes` | 删除节点及子树 |
| `duplicate_node` | 复制节点 |
| `link_to_frame` | 添加原型跳转 |

所有工具调用都会记录为 action chip，前端展示并可用一次撤销回滚整轮 AI 修改。

## Design.md

用于描述项目设计系统。每次 AI 请求都会追加到 system instruction：

```md
# Design system
- Brand color: #0ea5e9
- Accent: #0284c7
- Surface: #ffffff / #0f172a
- Radius: 12px
- Font: Inter
- Spacing: 4 / 8 / 12 / 16 / 24 / 32
- Buttons: 44px height, 12px radius, semibold label
- Cards: 1px border, subtle shadow, 16px padding
```

入口：编辑器账号菜单 → **Agent context & skills** → `Design.md`。

## AGENTS.md

用于描述 Agent 工作方式，而不是视觉 token：

```md
# Agent instructions
- Always create a frame before adding layers.
- Use sentence case for labels.
- Keep primary actions above the fold.
- Never use pure black; use #0f172a.
- When editing an existing screen, preserve component instances.
- Explain changes in one short paragraph, in the user's language.
```

与 Design.md 一起注入，每次请求生效。

## 自定义 Skills

采用 [Agent Skills](https://agentskills.io/specification) 格式。上传一个 `SKILL.md`：

```md
---
name: mobile-checkout
description: Use when designing or reviewing mobile checkout flows.
---
# Instructions
1. Keep the primary action above the fold.
2. Show order summary before payment.
3. Use the project's sky-blue primary token.
4. Add a back link on every step.
```

规则：

- `name`：小写字母、数字、连字符，2–63 字符。
- `description`：说明何时使用，ADK 会放进可用技能列表。
- 正文：具体步骤、检查项、示例。
- 单文件 ≤512KB。
- 同名上传会覆盖（按用户隔离）。

上传入口：**Agent context & skills → Skills → Upload SKILL.md**。

仓库内提供示例：

- `examples/design.md`
- `examples/AGENTS.md`
- `examples/skills/mobile-checkout/SKILL.md`

ADK 侧使用 `skilltoolset` + 自定义 `dbSkillSource`：

- `list_skills`：列出名称与描述。
- `load_skill`：加载完整指令。
- `load_skill_resource`：当前上传模型没有资源目录，返回 not found。

当技能与请求相关时，系统提示要求 Agent **必须先 `load_skill` 再执行**。

## MCP

MCP 让外部 Agent 使用同一套设计能力。

1. 账号菜单 → **Developer & MCP**。
2. 创建 PAT，选择 `mcp:read` / `mcp:write`，设置过期天数。
3. 复制一次性明文与配置片段。

配置：

```json
{
  "mcpServers": {
    "sigma": {
      "type": "http",
      "url": "https://sigma.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sigma_pat_..."
      }
    }
  }
}
```

工具列表：

```text
list_files   get_file     list_pages
get_page     create_file  create_frame
create_rect  create_ellipse  create_vector
create_text  update_node  delete_nodes
duplicate_node  link_to_frame
```

权限：

- 无 `mcp:read`：`tools/list` 返回 JSON-RPC `-32001`。
- 无 `mcp:write`：写工具返回 `isError: true`。
- PAT 仅接受于 `/api/mcp`，普通 REST 仍需要 JWT。
- 令牌只保存 SHA-256，明文只显示一次；支持过期与撤销。

## 会话与限制

- 每个聊天 `sessionId` 存在内存 SessionService；服务重启后丢失。
- 工具修改写回整份文档，广播增量 delta。
- 一次请求超时 150 秒。
- AI 修改是真实文档修改，不是生成图片。
- 当前不支持流式 token 输出与对话持久化，后续可接入 ADK streaming。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 401 / 未配置 Key | AI 设置中保存 Key 并测试 |
| 模型 404 | Base URL 与模型 ID 是否匹配当前服务商账号 |
| Agent 不调用技能 | 技能描述是否说明“何时使用”，尝试明确说“使用 mobile-checkout skill” |
| MCP 403 | PAT 是否包含对应 scope，是否过期 |
| AI 修改看不到 | 是否处于只读分享权限；刷新 / 检查 WebSocket |
