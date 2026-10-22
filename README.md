<div align="center">

# Sigma

**设计、原型、协作，以及真正能干活的 AI Agent。**

一个面向产品团队的协作式界面设计工作台：无限画布、矢量路径、组件实例、可点击原型、实时多人协作，以及可以读取项目规范、调用自定义 Skills 的 AI 设计助手。

`Go` · `React 19` · `TypeScript` · `Tailwind CSS 4` · `SQLite` · `WebSocket` · `Google ADK` · `Any OpenAI-compatible LLM`

</div>

![Sigma editor](docs/screenshots/03-editor-mobile.png)

## 为什么不只是另一个 Figma 克隆

Sigma 从第一天就把 **Agent** 和 **协作** 放进设计工具的核心，而不是事后再加一个聊天框。

- **AI 真的会改设计**：不是生成图片，而是通过结构化工具创建画板、文本、矢量、组件实例和原型链接。
- **AI 懂你的设计系统**：上传 `Design.md`、`AGENTS.md` 和自定义 `SKILL.md`，每次请求自动注入。
- **Agent 可以来自任何地方**：内置 BYOK（DeepSeek / OpenAI / Gemini / OpenRouter / Groq / Ollama / 自托管），也通过 MCP + PAT 让 Claude、Cursor 或自研 Agent 直接操作文件。
- **设计和原型在同一个文件里**：从静态界面到可点击流程，不需要切换工具。
- **数据是你的**：单二进制、SQLite、本地文件存储、可选企业 OIDC，一条命令部署。

## 功能全景

### 1. 专业设计画布

- 无限画布、缩放平移、点阵网格、框选、吸附辅助线、旋转、八向缩放。
- Frame、矩形、椭圆、直线、文本、图片、**可编辑矢量路径**。
- 钢笔工具逐点绘制路径，拖拽生成贝塞尔控制柄；平滑 / 尖角切换、双击加锚点、拖拽控制柄、`Alt` + 点击删锚点，闭合路径自动填充，矩形 / 椭圆 / 直线可一键转为矢量。
- **路径处理**：Pathfinder（合并 / 减去 / 相交 / 排除）、复合子路径与 `nonzero/evenodd` 填充规则、SVG 文件导入、描边转轮廓、外扩 / 内缩、路径简化、拆分、位图描摹为矢量。
- 图层树、图层搜索、显示 / 隐藏、锁定、拖拽排序、跨 Frame 拖拽、分组 / 取消分组。
- 位置尺寸、透明度、圆角、纯色 / 渐变、描边、阴影、模糊、字体排版、图片填充、对齐 / 分布。
- **Auto layout**：水平 / 垂直排列、gap、padding、交叉轴对齐、Hug 宽高；图层排序即布局顺序。
- **Constraints**：左 / 右 / 左右拉伸 / 居中 / 等比，父 Frame 缩放时自动响应。
- **本地样式**：颜色样式和文字样式随文件保存，一键套用到选中图层。
- **组件实例**：把任意图层转换为主组件，在组件库中一键插入实例；组件内部属性变化自动同步，也可手动更新实例或分离实例。
- 响应式手机 / 平板编辑器：抽屉、底部触控工具栏、双指缩放、触控缩放手柄。

### 2. 高频操作效率

- `⌘K` 命令面板：搜索工具、图层、页面、导出、分享、AI、样式和所有命令。
- 图层搜索：输入名称即可在数百层中定位，父级自动展开。
- `Esc` 取消选择，`F2` / `⌘R` 重命名，`⇧⌘H` 隐藏，`⇧⌘L` 锁定，`⇧2` 缩放到选中。
- `⌘X` 剪切、`⇧⌘V` 原位粘贴、`Alt` + 拖拽复制、`⌘⌥C/V` 复制 / 粘贴样式。
- `⌘⌥G` 用 Frame 包裹选中内容；选中浮条可快速复制、成组、包裹、创建组件、删除。
- 移动端工具栏提供 Undo / Redo，触控用户不再依赖键盘。
- 仪表盘支持文件夹、批量星标 / 移动 / 删除、网格 / 列表视图。
- `⌘F` 在当前页或整个文件中查找和替换文本。

### 3. 原型与协作

- 任意图层可设置点击交互：跳转 Frame、返回、打开 URL、过渡动画、热区。
- 一键全屏演示，支持手机、平板、桌面预览。
- 公开原型链接 `/p/:token`，无需账号即可查看完整流程。
- WebSocket 实时协作：多人光标、选区、在线状态、自动保存、断线重连。
- 节点级 LWW 合并 + 墓碑删除 + 增量同步，小操作不再上传整份文档。
- 评论、定位图层、解决 / 重新打开、站内通知、版本快照与恢复。
- 个人中心：自定义用户名、头像与个人颜色，头像同步到评论、协作者和通知。

### 4. AI 设计助手（BYOK）

- 用户自带任意 OpenAI-compatible 服务商 Key，AES-GCM 加密存储，只返回尾号。
- 内置 DeepSeek、OpenAI、Google Gemini、OpenRouter、Groq、Mistral、xAI、Together、Ollama 和自定义端点预设；默认仍为 `deepseek-v4.1-flash`。
- 基于 **Google ADK for Go** 的 `llmagent` + 结构化设计工具。
- 自然语言创建登录页、卡片、价格区块、图标；修改颜色、字号、圆角、位置；添加原型跳转。
- AI 修改实时广播给协作者，并支持本地撤销。
- **Design.md**：项目设计系统、品牌色、间距、字体、组件规则。
- **AGENTS.md**：Agent 工作约定、约束、审查清单。
- **自定义 Skills**：上传 Agent Skills 格式的 `SKILL.md`，ADK 通过 `list_skills` / `load_skill` 自动发现和加载。示例见 `examples/`。

### 5. 设计系统模板

内置 8 套模板：7 套常见设计系统 + 空白画布。每套设计系统都包含 **Home / Foundations / Components** 三页。

| 模板 | 设计系统 | 内容 |
| --- | --- | --- |
| Material Design 3 | Material You 色彩角色、Roboto 字阶、FAB、导航栏 | 首页 + Foundations + Components |
| Apple HIG | iOS 分组设置、SF Pro、开关、Tab Bar | 设置页 + Foundations + Components |
| Microsoft Fluent 2 | Command Bar、Segoe UI、指标卡片、数据表 | Dashboard + Foundations + Components |
| IBM Carbon | UI Shell、侧边导航、IBM Plex Sans、数据表 | 数据平台 + Foundations + Components |
| Ant Design | 阿里 Ant Group 企业级模式、`#1677FF` | Dashboard + Foundations + Components |
| ByteDance Arco | 字节 Arco、`#165DFF`、紧凑 4px | Console + Foundations + Components |
| Element Plus | 饿了么 Element、`#409EFF`、经典后台 | Dashboard + Foundations + Components |
| Blank canvas | 从零开始 | 空画布 |

![Design systems](docs/screenshots/30-design-systems.png)

### 6. 互操作与平台能力

- **Figma 导入**：通过 Figma REST API 导入文件（URL + Personal Access Token），自动转换为 Sigma 页面、Frame、文本、矢量路径、颜色、渐变、圆角、阴影。
- **Figma 导出**：导出 Sigma JSON，配套 Figma 开发插件一键还原到 Figma，保留 Frame、文本、颜色、渐变、阴影和图片。
- **MCP Server**：标准 JSON-RPC MCP 端点，暴露文件、页面、图层、创建 / 更新 / 删除、原型链接等工具。
- **PAT + Scope**：为 MCP 创建个人访问令牌，支持 `mcp:read` / `mcp:write` 最小权限、过期时间和撤销。
- **OIDC SSO**：标准 Authorization Code + PKCE，支持任意 OpenID Connect Provider；首次登录自动创建账号并绑定身份。
- **企业部署**：一键安装脚本、systemd 系统服务、Docker Compose、单二进制内嵌前端。
- **自动更新**：默认每 10 分钟检查 GitHub Release，SHA-256 校验后原子替换并重启；可关闭或调整间隔。更新控制仅对 `SIGMA_ADMIN_EMAILS` 中的实例管理员开放。

![Components](docs/screenshots/25-components.png)

| 矢量编辑 | Agent 上下文与 Skills |
| --- | --- |
| ![Vector](docs/screenshots/26-vector.png) | ![Agent context](docs/screenshots/27-agent-context.png) |

| MCP + PAT | Figma 导入 |
| --- | --- |
| ![MCP](docs/screenshots/28-mcp-pat.png) | ![Figma](docs/screenshots/29-figma-import.png) |

| 企业 OIDC 登录 | 设计系统模板 |
| --- | --- |
| ![OIDC](docs/screenshots/31-oidc.png) | ![Design systems](docs/screenshots/30-design-systems.png) |

| AI 设置（任意服务商） | 自然语言设计 |
| --- | --- |
| ![AI settings](docs/screenshots/33-ai-providers.png) | ![AI chat](docs/screenshots/22-ai-chat.png) |

| 个人中心 | 移动端顶栏 |
| --- | --- |
| ![Profile](docs/screenshots/32-profile.png) | ![Mobile topbar](docs/screenshots/34-mobile-topbar.png) |

| 文件面板 | 协作编辑器 |
| --- | --- |
| ![Dashboard](docs/screenshots/09-dashboard-thumbnails.png) | ![Editor](docs/screenshots/05-editor-dashboard.png) |

| 分享与权限 | 公开原型 |
| --- | --- |
| ![Share](docs/screenshots/10-share.png) | ![Public prototype](docs/screenshots/18-public-prototype.png) |

| 命令面板 | Auto layout |
| --- | --- |
| ![Command palette](docs/screenshots/41-command-palette.png) | ![Auto layout](docs/screenshots/42-auto-layout.png) |

| 文件夹与批量操作 | 本地样式 |
| --- | --- |
| ![Folders](docs/screenshots/43-folders-bulk.png) | ![Styles](docs/screenshots/44-local-styles.png) |

## 一键安装

支持 Linux 与 macOS（amd64 / arm64），自动选择最新 Release：

```bash
curl -fsSL https://raw.githubusercontent.com/holihur/sigma/main/install.sh | bash
```

安装脚本会：

- 校验 SHA-256 后安装单二进制（前端已内嵌）。
- 自动生成 `SIGMA_SECRET`。
- 有 systemd 时注册为系统服务（root）或用户服务（非 root）。
- 无 systemd 时以后台进程方式启动。
- 默认开启自动更新，每 **10 分钟**检查一次。
- 保留已有数据与密钥，可直接重复执行升级。

打开 <http://localhost:9000>，使用演示账号：

```text
demo@sigma.design / demo1234
```

自定义端口 / 数据目录 / 不安装服务：

```bash
curl -fsSL https://raw.githubusercontent.com/holihur/sigma/main/install.sh \
  | bash -s -- --port 8080 --home /srv/sigma --no-service
```

卸载服务（保留数据）：

```bash
curl -fsSL https://raw.githubusercontent.com/holihur/sigma/main/uninstall.sh | bash
```

> 生产环境请设置 `APP_BASE_URL`、`SIGMA_SECRET`，并在反向代理后启用 HTTPS。详细参数见 [部署文档](docs/DEPLOYMENT.md)。

## Docker

```bash
docker compose up -d --build
```

或：

```bash
docker build -t sigma .
docker run --rm -p 9000:9000 \
  -e SIGMA_SECRET="$(openssl rand -hex 32)" \
  -v sigma-data:/app/data sigma
```

## 本地开发

要求：**Go 1.25+**、**Node.js 20+**、**pnpm 10+**。

```bash
cd frontend && pnpm install && cd ..
cd backend && go run .
```

另开终端：

```bash
cd frontend && pnpm dev
```

打开 <http://localhost:5173>。Vite 会把 `/api` 与 WebSocket 代理到 `localhost:9000`。

生产构建：

```bash
make build   # 前端 + Go 二进制
make run     # http://localhost:9000
```

发布版本**只在 GitHub CI 中**由 GoReleaser 构建：推送 `v*` tag，或在 Actions 中手动触发 `Release` workflow。本地 `make release-snapshot` 仅用于验证，不会发布。

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构与数据模型](docs/ARCHITECTURE.md) | 技术栈、目录、LWW 合并、增量同步、向量 / 组件数据模型 |
| [API 参考](docs/API.md) | REST、WebSocket、MCP、PAT、OIDC、Figma、自动更新接口 |
| [部署指南](docs/DEPLOYMENT.md) | 环境变量、systemd、一键安装、Docker、OIDC、自动更新、发布流程 |
| [AI Agent 与 Skills](docs/AI-AGENTS.md) | 多服务商 BYOK、ADK、设计工具、Design.md / AGENTS.md / SKILL.md、MCP |
| [Figma 互通](docs/FIGMA.md) | REST 导入、插件导出、字段映射、限制 |
| [设计系统模板](docs/DESIGN-SYSTEMS.md) | Material 3、Apple HIG、Fluent 2、Carbon 的 token 与模板说明 |
| [快捷键](docs/SHORTCUTS.md) | 完整编辑器快捷键 |

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix primitives, zustand, lucide-react, sonner |
| 后端 | Go 1.25+, `net/http`, gorilla/websocket, SQLite (modernc.org/sqlite), JWT, bcrypt, Google ADK |
| AI | 任意 OpenAI-compatible 服务商（DeepSeek 默认）、自定义 ADK `model.LLM` adapter |
| 发布 | GoReleaser, GitHub Actions, systemd, Docker, SHA-256 self-update |

## 已知限制

- 协作合并粒度为节点级 LWW，文本没有字符级 CRDT；同一节点的高频并发编辑以较晚时间戳为准。
- 组件实例当前同步属性与子树，但不支持变体、嵌套覆盖矩阵和 Auto Layout。
- MCP 与 AI 修改走整份文档持久化，广播使用增量 delta。
- `.fig` 二进制不直接解析；请使用 Figma REST API 或配套插件。
- AI 会话保存在内存中，服务重启后历史会话不保留。
- 手机 / 平板适合浏览、轻量编辑和演示；复杂多图层排版仍建议桌面端。

---

Sigma 是一个从 Go 后端到 React 前端、从协作引擎到 Agent 工具层都自己实现的完整产品实验。如果它让你少开一个设计工具、少写一段重复提示词，目的就达到了。
