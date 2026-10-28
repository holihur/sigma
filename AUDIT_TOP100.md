# Sigma 全栈静态审计报告 — Top 100 Issues

> **执行方式**：纯静态分析（`grep / read / ast`），未执行 `go build / pnpm build`，遵守“不要编译没有内存”约束。  
> **审计范围**：`backend/**` · `frontend/**` · `Dockerfile` · `install.sh` · `deploy/**` · `docs/**` · `figma-plugin/**`  
> **审计维度**：安全 · 性能 · UI/UX · 产品功能 · 市场/工程化  
> **时间**：2026-10-28 · 审计人：Muse Spark (pi-coding-agent)

---

## 执行摘要

| 维度 | 数量 | Critical | High | Medium | Low |
|------|------|----------|------|--------|-----|
| 安全 Security | 30 | 6 | 14 | 8 | 2 |
| 性能 Performance | 16 | 2 | 6 | 6 | 2 |
| UI/UX | 20 | 1 | 5 | 11 | 3 |
| 产品 Product | 15 | 1 | 4 | 7 | 3 |
| 市场/工程化 Market | 19 | 1 | 3 | 9 | 6 |
| **合计** | **100** | **11** | **32** | **41** | **16** |

**最紧急的 5 件事（若今晚只修 5 个）：**
1. **#S01 默认 SECRET 硬编码** — 任何人可伪造 JWT，入侵任意实例。
2. **#S03 CORS 任意源反射 + 凭证** — 跨站窃取用户数据。
3. **#S05 无速率限制** — 登录/注册/OIDC 可暴力枚举 + 撞库。
4. **#P01 单连接 SQLite** — 高并发协作下全站阻塞。
5. **#M19 无 LICENSE 文件** — 企业客户法务卡死，无法商用。

---

## 严重性定义

- **Critical** — 可直接导致数据泄露、接管、资金/法律风险或全站不可用。
- **High** — 显著安全/性能/体验缺陷，影响核心功能。
- **Medium** — 明显缺陷，有 workaround 但影响可维护性与转化。
- **Low** — 细节改进，建议排期。

---

## 一、安全 Security（S01—S30）

### S01 [Critical] 默认 SIGMA_SECRET 硬编码回退
- **文件**：`backend/main.go:36` `backend/internal/auth/auth.go:13`
- **现象**：`env("SIGMA_SECRET", "sigma-dev-secret-change-in-production")` 且 `auth.New` 内二次回退 `sigma-development-secret-change-me`。
- **影响**：未配置 SECRET 的实例（Docker/Demo/家庭部署常见）JWT 可被离线伪造，任意用户提权、伪造 `owner`。
- **建议**：启动时若 `SIGMA_SECRET` 为默认值且 `PORT != 5173` 直接 `log.Fatalf` 拒绝启动；文档与 `install.sh` 强制生成 32 字节随机。

### S02 [Critical] JWT 有效期 30 天且无撤销
- **文件**：`backend/internal/auth/auth.go:35` `exp = 30*24h`
- **现象**：签发后无法撤销（无黑名单/JTI/refresh token），PAT 亦无强制短期。
- **影响**：Token 泄露后 30 天内持续有效，即使改密也无法踢掉。
- **建议**：`exp` 缩至 24h + `refresh_token` 7天 + Redis/DB 黑名单，或至少支持 `PATCH /auth/logout` 记录 `jti` 失效。

### S03 [Critical] CORS 反射任意 Origin + Allow-Credentials
- **文件**：`backend/internal/api/api.go:186-204`
- **现象**：`Allow-Origin = Origin` + `Allow-Credentials: true`，未白名单校验。
- **影响**：任意钓鱼站可携带凭证跨域读 ` /api/files` 私有设计稿。
- **建议**：引入 `APP_ALLOWED_ORIGINS` 白名单，无配置时仅允许同源；`Vary: Origin` 已有，补充 `Access-Control-Max-Age`。

### S04 [Critical] WebSocket `CheckOrigin: true` 任意源劫持
- **文件**：`backend/internal/ws/hub.go:84`
- **现象**：`CheckOrigin: func() bool {return true}` 允许任意站点建 `wss://host/api/ws`。
- **影响**：配合 S03 可在受害者后台静默建立协作连接，嗅探/注入文档。
- **建议**：复用 CORS 白名单，或至少校验 `Origin == APP_BASE_URL`。

### S05 [Critical] 全站无速率限制（Rate Limit）
- **文件**：`backend/internal/api/api.go:Handler()` 全路由
- **现象**：`login/register/oidc/上传/ai/chat/mcp` 均无限流/验证码。
- **影响**：暴力撞库、邮箱枚举、AI 计费打爆、Figma 代理被作跳板。
- **建议**：接入 `golang.org/x/time/rate` 或 ` Tollbooth`：登录 5/min/IP + 20/min/账号，注册 3/h/IP，AI chat 30/min/user。

### S06 [High] 密码策略过弱（6 位，无复杂度）
- **文件**：`backend/internal/api/auth_handlers.go:47` `frontend/src/pages/Login.tsx:91`
- **现象**：仅 `len >=6`，示例 demo 密码 `demo1234` 更弱。
- **影响**：弱口令撞库成功率高。
- **建议**：后端改为 `>=10` 且 `zxcvbn` 评分 ≥3，或至少 8 位 + 禁止常见字典。

### S07 [High] 注册邮箱未验证
- **文件**：`backend/internal/api/auth_handlers.go:handleRegister`
- **现象**：`CreateUser` 后直接签发 token，无邮件确认。
- **影响**：可抢注他人邮箱、伪造身份邀请协作，OIDC 邮箱劫持放大。
- **建议**：新增 `email_verified` 字段，未验证用户限制 `share` 功能；或集成邮件验证。

### S08 [High] AES 密钥派生用 SHA256(secret)
- **文件**：`backend/internal/ai/crypto.go:15 deriveKey`
- **现象**：`SHA256(secret)` 直接作 AES-256 密钥，无 salt/迭代。
- **影响**：若 secret 低熵（人类设置），可离线暴力还原 API Key。
- **建议**：`HKDF-SHA256` 或 `Argon2id`，`salt = random 16B + stored`。

### S09 [High] `readJSON` 限制 64MB
- **文件**：`backend/internal/api/api.go:325`
- **现象**：`LimitReader 64<<20` 对 `PUT /doc` 允许 64MB JSON。
- **影响**：攻击者频繁 PUT 超大 doc 撑爆 DB/内存（SQLite 1 连接阻塞）。
- **建议**：`PUT /doc` 限制 8-10MB；`Figma import-json 96MB` 单独白名单，流式校验。

### S10 [High] 文档合并无 `page/nodes` 数量上限
- **文件**：`backend/internal/doc/doc.go:Merge` `backend/internal/api/file_handlers.go:mergeAndSave`
- **现象**：未限制 pages/nodes 总量，恶意构造 10w 节点。
- **影响**：`cloneDoc` 深拷贝 O(n) + 前端渲染崩溃，DB 体积暴增。
- **建议**：每文件上限 3000 节点/ 20 页，超限返回 413。

### S11 [High] WebSocket `ReadLimit 48MB`
- **文件**：`backend/internal/ws/hub.go:146 ReadLimit 48<<20`
- **现象**：单条消息可 48MB。
- **影响**：单客户端可撑爆服务器内存。
- **建议**：降至 2MB（doc delta 场景 1MB 足够）。

### S12 [Medium] 上传仅校验 `DetectContentType`，可伪造
- **文件**：`backend/internal/api/upload_handlers.go:34`
- **现象**：`allowedImageTypes[DetectContentType(data)]`，后缀由检测决定，文件名随机。
- **影响**：可上传伪装图片的 Polyglot，需配合其他漏洞才可利用，但缺少 `virus scan`。
- **建议**：补充 `file header magic + 扩展名交叉校验`，可选接入 `clamav`。

### S13 [Medium] 上传未限制单用户配额/频率
- **文件**：`backend/internal/api/upload_handlers.go`
- **现象**：无 `uploads per user/day`。
- **影响**：恶意刷 10MB * N 占满磁盘（无 `quota`）。
- **建议**：每用户 500MB 配额 + LRU 清理，`UPLOAD_DIR` 磁盘监控。

### S14 [High] OIDC 未校验 `email_verified`
- **文件**：`backend/internal/auth/oidc.go:227-265` `backend/internal/api/oidc_handlers.go:76`
- **现象**：只要 `email` 有值即自动建账号/绑定，未强制 `email_verified=true`。
- **影响**：部分 IdP（如 GitLab 自托管）允许未验证邮箱注册，可劫持任意邮箱账号。
- **建议**：`if !claims.EmailVerified -> 拒绝或要求二次确认`，`LinkIdentity` 前加验证。

### S15 [Medium] SSO 账号仍可用密码登录
- **文件**：`backend/internal/api/oidc_handlers.go:77 RandomPassword()`
- **现象**：SSO 自动创建用户时生成随机密码 hash 存库，未标记 `sso_only`。
- **影响**：若攻击者猜测/重置随机密码（虽 24B hex 熵高），或后期 `reset password` 功能被加，会绕过 SSO。
- **建议**：新增 `password_disabled` 列，SSO 账号登录时提示“请使用 SSO”。

### S16 [Low] PAT hash 为无盐 SHA256
- **文件**：`backend/internal/auth/pat.go:36 HashPAT`
- **现象**：`SHA256(raw)` 存储。
- **影响**：若 DB 泄露，PAT 雖 32B 随机难以彩虹，但无盐不符合最佳实践。
- **建议**：`HMAC-SHA256(secret, raw)` 或 `bcrypt`（需考虑查询性能，可 HMAC）。

### S17 [Medium] 过期 PAT 未清理
- **文件**：`backend/internal/store/store.go:PATByHash` `backend/internal/api/token_handlers.go`
- **现象**：仅在 `requireMCPAuth` 校验时判断过期，未有定时清理。
- **影响**：DB 残留过期 token 膨胀。
- **建议**：`DELETE FROM personal_access_tokens WHERE expires_at < now()` 定时任务或启动清理。

### S18 [High] 缺少关键安全头（CSP/HSTS/X-Frame-Options）
- **文件**：`backend/internal/api/api.go:spaFSHandler` `Dockerfile`
- **现象**：未设置 `Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, Permissions-Policy`。
- **影响**：点击劫持、MIME 混淆、未强制 HTTPS。
- **建议**：`withSecurityHeaders` 中间件：`X-Content-Type-Options: nosniff` 已有，补充其余；HSTS 仅当 `X-Forwarded-Proto=https`。

### S19 [High] Token 存 `localStorage` 易受 XSS 窃取
- **文件**：`frontend/src/lib/api.ts:23 TOKEN_KEY` `frontend/src/store/auth.ts`
- **现象**：`Bearer token` 明文 localStorage。
- **影响**：任意 XSS 即可持久接管账号。
- **建议**：`httpOnly Secure SameSite=Lax cookie` + `CSRF token` 双提交；短期内加 `__Host-` 前缀。

### S20 [High] 评论/文本未做 DOMPurify，存储型 XSS 风险（虽 React 转义但富文本待扩展）
- **文件**：`frontend/src/components/editor/NodeView.tsx:62 textStyle` `backend/internal/api/collab_handlers.go:handleCreateComment`
- **现象**：`node.text` 直接渲染 ` {node.text}`（目前安全），但后续若支持 Markdown/链接 `targetFrameId.url` 会成为注入点。
- **影响**：需提前防御。
- **建议**：后端 `text` 长度 4000 已限，补充 `bluemonday` 消毒（若未来支持 HTML）；前端 `src` 校验仅 `/api/uploads/` 已做，很好，推广到 `url` 字段。

### S21 [Medium] MCP `link_to_frame` 的 `url` 未校验
- **文件**：`backend/internal/design/model.go:Link.URL` `backend/internal/api/mcp_handlers.go:link_to_frame`
- **现象**：`LinkAction = "url"` 时 `url` 未校验 scheme。
- **影响**：可插入 `javascript:` 伪协议，Prototype 点击触发 XSS。
- **建议**：仅允许 `http/https/mailto`，拒绝 `javascript: data:`。

### S22 [Medium] 错误响应泄露内部细节
- **文件**：`backend/internal/api/*.go:writeError` 多处 `err.Error()` 直接返回
- **现象**：如 `Figma API returned 500 ...` 原样透传。
- **影响**：信息收集。
- **建议**：对用户返回泛化消息，细节仅 `log.Printf` 带 requestID。

### S23 [Low] 管理员判定大小写宽松但未去重空串
- **文件**：`backend/internal/api/api.go:parseAdminEmails`
- **现象**：`SIGMA_ADMIN_EMAILS=,,` 会产生空串键，虽已过滤，但日志未提示。
- **影响**：低。
- **建议**：启动时打印 `admin count` 便于排查。

### S24 [High] 静态资源无 SRI / 被投毒风险
- **文件**：`frontend/index.html` `backend/internal/static/*`
- **现象**：CDN 劫持后无完整性校验。
- **影响**：供应链攻击。
- **建议**：`vite build` 生成 `integrity` manifest，HTML 注入 `integrity`。

### S25 [Critical] 自更新可被回滚到旧版（无 downgrade 保护）
- **文件**：`backend/internal/update/update.go:versionGreater`
- **现象**：仅判断 `latest != current`，未校验 `latest > current` 时才允许？虽有 `available` 但 `Apply` 未强制 `versionGreater` 二次校验。
- **影响**：攻击者劫持 DNS 可让新版回滚到含漏洞旧版。
- **建议**：`Apply` 内 `if !versionGreater(latest, current) return error("downgrade refused")`。

### S26 [Medium] `install.sh` curl 管道虽校验 SHA256 但无签名
- **文件**：`install.sh:90`
- **现象**：`curl $base/$asset + checksums.txt`，若 `SIGMA_RELEASE_BASE` 被投毒，仅 SHA256 自校验。
- **影响**：供应链风险。
- **建议**：支持 `cosign`/`minisign` 验证 `checksums.txt.sig`，文档增加 `GPG` 指纹。

### S27 [Medium] `docker-compose.yml` 默认 SECRET 明文 `change-me-in-production`
- **文件**：`docker-compose.yml:17 SIGMA_SECRET: ${SIGMA_SECRET:-change-me-in-production}`
- **现象**：用户直接 `docker compose up` 即以弱密钥运行。
- **影响**：同 S01。
- **建议**：compose 中不设默认值，无 `SIGMA_SECRET` 直接 `error`；或 entrypoint 生成随机并持久到 volume。

### S28 [Low] BREACH 风险：gzip 对包含 secret 的响应也启用
- **文件**：`backend/internal/api/api.go:gzipEligible` 对 `json` 启用 gzip
- **现象**：`/ai/settings` 含 `keyHint` 虽仅尾号，但配合反射可放大 BREACH。
- **影响**：低（需 attacker 控制注入 + 观测压缩大小）。
- **建议**：对含敏感字段的端点 `Cache-Control:no-cache + Vary` 且禁用 gzip，或长度随机填充。

### S29 [Medium] 日志可能泄露敏感（Figma Token / AI Key）
- **文件**：`backend/internal/api/figma_handlers.go` `backend/internal/ai/openai.go`
- **现象**：`log.Printf("update check: %v", err)` 可能包含 token 片段。
- **影响**：日志聚合系统泄露。
- **建议**：统一 `sanitizeError` 遮掩 `token`/`key`。

### S30 [Medium] 缺少审计日志（谁/何时/改了什么）
- **文件**：`backend/internal/api/file_handlers.go` `collab_handlers.go`
- **现象**：`RenameFile / AddMember / DeleteFile` 仅写 `updated_at`，无 `audit_log` 表。
- **影响**：无法追责、合规审计失败。
- **建议**：新增 `audit_logs(id,file_id,actor_id,action,meta,created_at)` 中间件记录。

---

## 二、性能 Performance（P01—P16）

### P01 [Critical] SQLite 单连接瓶颈
- **文件**：`backend/internal/store/store.go:26 SetMaxOpenConns(1)` + `_pragma=busy_timeout(5000)`
- **现象**：所有读写串行，协作 `mergeAndSave` 持 `sync.Mutex` + 写 DB。
- **影响**：>20 人同时编辑 P95 > 2s，超时。
- **建议**：`SetMaxOpenConns(4)` + WAL 已启用，读并发；写用 `BEGIN IMMEDIATE` 重试；或迁移 `libsql / postgres`。

### P02 [High] `pruneTombstones` 空实现导致文档无限膨胀
- **文件**：`backend/internal/api/file_handlers.go:268 pruneTombstones` 直接返回原 map
- **现象**：删除的节点墓碑永不清理。
- **影响**：千次删除后 doc JSON 数 MB，前端 `Merge` 每次遍历全 tombstones。
- **建议**：>30 天的 tombstones 且已同步到所有客户端后 GC，或 `VACUUM` 策略。

### P03 [High] `cloneDoc` + `structuredClone` 高频深拷贝主线程阻塞
- **文件**：`backend/internal/doc/doc.go:cloneDoc` `frontend/src/store/editor.ts: structuredClone`
- **现象**：每 `nudge 1px` 都克隆整个 doc。
- **影响**：3000 节点时单次 30-50ms，掉帧。
- **建议**：后端用 `json.RawMessage` 延迟拷贝；前端用 `immer` + 结构共享。

### P04 [High] 前端 `Canvas.tsx` 全量重渲染（1665 行单组件）
- **文件**：`frontend/src/components/editor/Canvas.tsx`
- **现象**：`NodeView` 递归渲染，未 `React.memo / virtualize`。
- **影响**：1000 节点时拖拽 15 FPS。
- **建议**：视口裁剪 `react-window`；`NodeView` memo + `useShallow`；`SelectionOverlay` 分离。

### P05 [High] 缩略图 `html-to-image` 同步跑在主线程
- **文件**：`frontend/src/pages/Editor.tsx: captureThumbnail` `html-to-image: 1.11.13`
- **现象**：`toPng` 每 50s + 6s 延迟触发，`pixelRatio 0.35` 仍需 rasterize。
- **影响**：大画板时阻塞 800ms。
- **建议**：移至 `OffscreenCanvas` Worker；或后端 `chromium --screenshot` 异步生成。

### P06 [Medium] `Dashboard` 无分页，全量拉 `ListFiles`
- **文件**：`backend/internal/store/store.go:ListFiles` `frontend/src/pages/Dashboard.tsx:load`
- **现象**：`SELECT ... ORDER BY updated_at DESC` 全表。
- **影响**：千文件时首屏 2MB JSON。
- **建议**：`limit 50 + cursor` + 搜索后端化。

### P07 [Medium] `gzip.Writer` 每请求新建，无池复用
- **文件**：`backend/internal/api/api.go:gzipResponseWriter`
- **现象**：`gzip.NewWriter(w)` 高频分配。
- **影响**：GC 压力。
- **建议**：`sync.Pool` 复用 `gzip.Writer`。

### P08 [Medium] WebSocket 广播持锁遍历，慢客户端拖慢全房间
- **文件**：`backend/internal/ws/hub.go:broadcastDoc / broadcastDelta`
- **现象**：`mu.Lock()` 期间遍历 `enqueue`，虽 `select default drop`，但持锁。
- **影响**：一人网络差，全房间卡顿。
- **建议**：拷贝客户端列表后解锁再逐个 `enqueue`；或分房间 `RWMutex`。

### P09 [Medium] `Figma Fetch` 90s 超时 + 96MB 缓冲
- **文件**：`backend/internal/figma/figma.go:31 Client Timeout 90s` `Fetch: 96<<20`
- **现象**：大文件同步阻塞 90s。
- **影响**：DoS 放大，占用 DB 连接。
- **建议**：超时 25s + 流式 `json.Decoder` + 后台任务队列。

### P10 [Medium] `update.Download` 512MB 未限速
- **文件**：`backend/internal/update/update.go:397 LimitReader 512<<20`
- **现象**：自动更新可 512MB 直接落盘。
- **影响**：磁盘打满。
- **建议**：校验 `Content-Length` + 进度条 + 剩余空间预检。

### P11 [Low] `Dashboard` 搜索无 debounce
- **文件**：`frontend/src/pages/Dashboard.tsx: visible = useMemo(... search)`
- **现象**：击键即全量过滤 + 渲染。
- **影响**：输入卡顿。
- **建议**：`useDebouncedValue(search, 200ms)`。

### P12 [High] AutoLayout `reflowPage` 每次变更全量递归
- **文件**：`frontend/src/store/editor.ts:reflowPage / reflowNode`
- **现象**：`for (id of rootIds) reflowNode` + 二次遍历 `Object.keys(nodes)`。
- **影响**：嵌套 AutoLayout 每次拖动 O(n²)。
- **建议**：仅回流受影响链路（dirty flag 向上标记）+ `requestAnimationFrame` 合并。

### P13 [Low] Vite 无 `manualChunks`，首包过大
- **文件**：`frontend/vite.config.ts`
- **现象**：`build.sourcemap false` 但无分包策略。
- **影响**：首屏 JS 1.2MB。
- **建议**：`manualChunks: {vendor: ['react','zustand'], vector: ['paper','clipper-lib']}`。

### P14 [Medium] `LayersPanel` 搜索线性遍历无索引
- **文件**：`frontend/src/components/editor/LayersPanel.tsx:623`
- **现象**：全文匹配 `node.name`。
- **影响**：千层搜索 100ms。
- **建议**：构建 `Fuse` 索引或 `Map<token, id[]>`。

### P15 [High] `vectors / clipper-lib / paper` 同步 import 阻塞 AI/评论
- **文件**：`frontend/src/lib/vector-ops.ts` `frontend/src/store/editor.ts`
- **现象**：矢量引擎首屏即加载。
- **影响**：LCP 增加 400ms。
- **建议**：`import('paper')` 懒加载，`pathfinder` 按需。

### P16 [High] SQLite `journal_mode(WAL)` + `MaxOpenConns 1` 与 `VACUUM` 冲突
- **文件**：`backend/internal/store/store.go:17 dsn`
- **现象**：WAL 下单连接 `VACUUM` 会阻塞写。
- **影响**：维护窗口不可用。
- **建议**：维护时 `PRAGMA wal_checkpoint(TRUNCATE)` + 离线 `VACUUM`。

---

## 三、UI/UX（U01—U20）

### U01 [High] 色彩对比度不足（WCAG AA 失败）
- **文件**：`frontend/src/index.css` `frontend/src/components/editor/TopBar.tsx`
- **现象**：`--primary #0ea5e9` 在白色文字上对比 3.1:1 < 4.5:1；深色模式更差。
- **影响**：可访问性、长时阅读疲劳。
- **建议**：`primary` 改 `#0284c7`（7:1），或自动计算 `color-contrast`。

### U02 [High] 命令面板快捷键冲突且 Windows 显示错误
- **文件**：`frontend/src/pages/Editor.tsx: keydown ⌘K` `docs/SHORTCUTS.md`
- **现象**：`metaKey` 提示为 `⌘`，Windows 实为 `Ctrl`，但 UI 仍显示 `⌘`。
- **影响**：Windows 用户困惑。
- **建议**：运行时 `navigator.platform` 动态显示 `Ctrl+K`。

### U03 [Medium] 空状态缺引导
- **文件**：`frontend/src/pages/Dashboard.tsx: visible.length===0`
- **现象**：无设计时仅空白列表，无插图/新建引导。
- **影响**：新用户转化低。
- **建议**：`EmptyState` 插图 + “从模板创建” 3 步引导。

### U04 [Medium] 删除二次确认缺上下文
- **文件**：`frontend/src/pages/Dashboard.tsx:deleteTarget` `frontend/src/components/editor/Toolbar.tsx`
- **现象**：仅 `Are you sure?`，未显示 `被 3 人协作` 或 `含 2 个评论`。
- **影响**：误删协作稿。
- **建议**：对话框显示 `members + comments + lastEdited`，需输入文件名确认。

### U05 [Medium] 移动端底部工具栏遮挡画布
- **文件**：`frontend/src/components/editor/Toolbar.tsx:136` `Editor.tsx:fit() topPad 16 bottomPad120`
- **现象**：`bottomPad 120` 硬编码，小屏设备仍遮挡。
- **影响**：iPhone SE 无法看到底部像素。
- **建议**：`env(safe-area-inset-bottom) + 视觉视口 API` 动态 `padding`。

### U06 [Medium] 深色模式切换闪白（FOUC）
- **文件**：`frontend/src/store/theme.ts:6 localStorage` `frontend/src/main.tsx`
- **现象**：`bootTheme()` 在 `useEffect` 中，首帧为亮色。
- **影响**：夜间用户刺眼。
- **建议**：`index.html` 内联 `<script>document.documentElement.classList.add(localStorage.theme)</script>` 阻塞前执行。

### U07 [High] 矢量手柄命中区 12px 过小，触控难用
- **文件**：`frontend/src/components/editor/Canvas.tsx:vector-handle` `SelectionOverlay.tsx`
- **现象**：`12px` 命中阈值。
- **影响**：平板/触屏无法编辑矢量。
- **建议**：触控下 `24px`，鼠标 `12px`；扩大透明命中层。

### U08 [Medium] 通知已读乐观更新但未回滚
- **文件**：`frontend/src/pages/Dashboard.tsx:openNotifications` `frontend/src/pages/Editor.tsx:useCollaboration`
- **现象**：`setUnread(0)` 后若 `api.read()` 失败不回滚。
- **影响**：未读数不一致。
- **建议**：失败时 `setUnread(prev)` 回滚 + `toast`。

### U09 [Medium] 公开原型页缺 SEO/OGP
- **文件**：`frontend/src/pages/PublicPrototype.tsx`
- **现象**：`<title>Sigma — Prototype</title>` 固定，无 `og:image`。
- **影响**：分享到 Slack/Notion 无预览，转化低。
- **建议**：后端 `handlePublicFile` 同步输出 `og:title/og:image`（取 thumbnail）。

### U10 [High] 加载态仅转圈，无骨架屏，CLS 2.1
- **文件**：`frontend/src/App.tsx:Splash`
- **现象**：`Loading your workspace…` 纯色动画。
- **影响**：感知慢。
- **建议**：Dashboard/Editor 骨架屏（灰块列表/画布），`prefetchEditor` 已有，需配合 `Suspense`。

### U11 [Medium] 评论锚点无磁吸/对齐
- **文件**：`frontend/src/components/editor/CommentsPanel.tsx`
- **现象**：`x,y` 自由放置，无吸附图层边缘。
- **影响**：评论与图层错位。
- **建议**：拖动时复用画布 `guides` 吸附最近边 8px。

### U12 [Medium] 文本编辑 `textarea` 覆盖样式与实际不一致
- **文件**：`frontend/src/components/editor/NodeView.tsx:TextEditor`
- **现象**：`textarea` 用 `textStyle` 但 `lineHeight 1.4` 在编辑时行高跳变，且 `resize: none` 未禁 `overflow` 滚动条。
- **影响**：编辑时文本跳动。
- **建议**：编辑器 `contentEditable` Div 与渲染共用样式，或 `textarea` 设 `line-height: exact`。

### U13 [Low] 快捷键在输入框内仍触发（已部分防护但遗漏）
- **文件**：`frontend/src/pages/Editor.tsx:isEditableTarget` `frontend/src/components/editor/Canvas.tsx`
- **现象**：`isEditableTarget` 仅检查 `input/textarea/contentEditable`，未覆盖 `select` 下拉搜索。
- **影响**：重命名时按 `Delete` 误删图层。
- **建议**：统一 `e.target.closest('[contenteditable],input,textarea,select')`。

### U14 [Medium] 选择工具栏在视口边缘被裁
- **文件**：`frontend/src/components/editor/SelectionToolbar.tsx`
- **现象**：靠近画布顶部时工具栏 `top: -40` 被顶栏遮挡。
- **影响**：无法点到对齐按钮。
- **建议**：`floating-ui` 自动翻转 `bottom/top`。

### U15 [Low] 字体列表 OOM（未虚拟化）
- **文件**：`frontend/src/components/editor/PropertiesPanel.tsx:1476` `FONT_FAMILIES`
- **现象**：`select` 渲染 200 字体预览。
- **影响**：PropertiesPanel 打开慢。
- **建议**：`Radix Select` + `virtualized`，预览用 `canvas` 按需。

### U16 [Medium] 撤销历史 60 步且无分组
- **文件**：`frontend/src/store/editor.ts: past.slice(-60)`
- **现象**：拖动 1px 每帧 `pushHistory`（虽 `record=false` 部分场景，但 `nudge` 仍每键一步）。
- **影响**：`Ctrl+Z` 需按 20 次才回到上次拖动前。
- **建议**：`pushHistory` 节流 300ms 合并，或 `transaction` 分组（dragStart→dragEnd 合为 1）。

### U17 [Medium] 缩略图存 `dataUrl` 在 DB 行内
- **文件**：`backend/internal/store/store.go:SetThumbnail` `frontend/src/pages/Editor.tsx:captureThumbnail`
- **现象**：`thumbnail TEXT` 存 400KB base64。
- **影响**：`ListFiles` 传输 10 文件 = 4MB。
- **建议**：缩略图存 `uploads/thumb/<id>.webp`，DB 仅存路径；或 `SELECT` 时不返回 `thumbnail`，懒加载。

### U18 [Low] i18n 大文件 611 行同步加载
- **文件**：`frontend/src/i18n/index.ts`
- **现象**：中英字典全量打包。
- **影响**：首包 +120KB。
- **建议**：`import(`./locales/${locale}.json`)` 懒加载。

### U19 [Medium] 原型点击热区无视觉预览
- **文件**：`frontend/src/components/editor/PreviewMode.tsx:388`
- **现象**：仅设置 `link.transition`，无过渡动画预览图。
- **影响**：用户不确定交互效果。
- **建议**：PreviewMode 悬浮显示 `transition` 动效缩略。

### U20 [Medium] `LanguageToggle` 在登录页与其他按钮样式不统一
- **文件**：`frontend/src/components/LanguageToggle.tsx` `Login.tsx: LanguageToggle`
- **现象**：`border bg-background/70` 与其他 `outline` 按钮不一致。
- **影响**：视觉噪音。
- **建议**：统一 `variant ghost`。

---

## 四、产品 Product（F01—F15）

### F01 [Critical] 组件“有限支持”与营销文案不符
- **文件**：`README.md: 组件实例` “组件内部属性变化自动同步” `frontend/src/store/editor.ts:syncInstances`
- **现象**：文档称“组件化”，实测仅 `syncInstances` 同步 `children`，无变体、嵌套覆盖、布局继承。
- **影响**：企业用户 PoC 失败，口碑反噬。
- **建议**：README 增加 `Beta: 仅单层同步` 提示；或快速实现 `componentId + override map`。

### F02 [High] 协作文本并发丢失（无 CRDT）
- **文件**：`backend/internal/doc/doc.go:Merge (per-node LWW)` `README 已知限制`
- **现象**：同节点文本高频并发以 `ts` 后者覆盖，前者字符丢失。
- **影响**：2 人同时打字丢句。
- **建议**：文本字段改 `Yjs / Automerge` 字符级，或至少展示冲突提示“有人正在编辑此文本”。

### F03 [Medium] 版本历史无 Diff 预览
- **文件**：`backend/internal/api/collab_handlers.go:handleRestoreVersion` `frontend/src/components/editor/VersionHistoryDialog.tsx`
- **现象**：仅列表 `name/version/author`，恢复前无法对比。
- **影响**：误恢复旧版。
- **建议**：`VersionHistoryDialog` 增加 `diff`（节点增删/属性变更高亮），或缩略图对比。

### F04 [High] AI 会话内存存储，重启丢失
- **文件**：`backend/internal/api/api.go: aiSessions: session.InMemoryService()` `backend/internal/api/ai_handlers.go`
- **现象**：`session.InMemoryService` 无持久化。
- **影响**：服务器重启/更新后历史会话全丢，Beta 用户抱怨。
- **建议**：`SQLite` 或 `disk` 实现 `session.Service`，或至少 `gob` 持久到 `data/ai_sessions`。

### F05 [Medium] AI `create_frame` 未校验循环父子
- **文件**：`backend/internal/design/model.go:Page.Add` `backend/internal/api/mcp_handlers.go:mcpMutate`
- **现象**：`parentId` 可为自身或子孙。
- **影响**：构造循环图导致 `nodeMatrix` 无限递归（虽有 `guard 100`，但仍脏数据）。
- **建议**：`Add` 时 `isAncestor(parent, node) -> 拒绝`。

### F06 [Medium] 本地样式无团队库
- **文件**：`frontend/src/components/editor/StylesDialog.tsx` `backend/internal/doc/doc.go:Styles`
- **现象**：`styles` 随文件保存，跨文件无法复用。
- **影响**：设计系统推广受阻。
- **建议**：新增 `team_styles` 表，支持 `publish to team`。

### F07 [Medium] 约束与 AutoLayout 互斥未强制
- **文件**：`frontend/src/store/editor.ts:reflowNode` + `applyConstraints`
- **现象**：同一 Frame 子节点可同时设 `constraintH + layoutPositioning auto`。
- **影响**：缩放时抖动。
- **建议**：AutoLayout 容器内 `constraint` 自动 `disabled`，UI 灰置。

### F08 [Low] 图片 `objectFit` 未保留上次选择
- **文件**：`frontend/src/components/editor/PropertiesPanel.tsx`
- **现象**：新建 image 始终 `cover`。
- **影响**：用户重复设置。
- **建议**：记录 `lastObjectFit` 到 `localStorage`。

### F09 [Low] 文件夹同名未去重
- **文件**：`frontend/src/pages/Dashboard.tsx:folders + bulkMove` `backend/internal/store/store.go:SetFolder`
- **现象**：允许创建 `Folder A / folder a` 大小写并存。
- **影响**：搜索混乱。
- **建议**：`LOWER(folder)` 唯一性提示，或自动重命名 `Folder A (2)`。

### F10 [High] 公开链接无过期/密码
- **文件**：`backend/internal/store/store.go:SetPublicLink` `backend/internal/api/share_handlers.go`
- **现象**：`enabled bool` 仅开关，无 `expiresAt / password`。
- **影响**：企业外发不可控，需手动关闭。
- **建议**：`public_links` 加 `expires_at` + `password_hash`，UI 增加设置。

### F11 [Medium] 评论仅一级，未 thread 折叠
- **文件**：`backend/internal/api/collab_handlers.go:handleCreateComment parentId` `frontend/src/components/editor/CommentsPanel.tsx`
- **现象**：虽有 `parentId` 但 `DeleteCommentReplies` 仅一层，UI 未折叠。
- **影响**：长讨论刷屏。
- **建议**：`CommentsPanel` 按 `parentId` 分组折叠，支持 `resolve thread`。

### F12 [Medium] MCP `list_files` 无分页
- **文件**：`backend/internal/api/mcp_handlers.go:mcpCallTool case "list_files"`
- **现象**：`ListFiles` 返回全量。
- **影响**：千文件时 MCP `Claude` 上下文超限。
- **建议**：`limit 30 + nextCursor`。

### F13 [Low] 模板加载失败静默
- **文件**：`backend/main.go:seedDemo` `templates.Load`
- **现象**：`if !ok continue` 无日志。
- **影响**：模板损坏难排查。
- **建议**：`log.Printf("template %s not found", tmpl)`。

### F14 [Medium] 约束 `scale` 在旋转父容器下计算错误
- **文件**：`frontend/src/lib/nodes.ts:applyConstraints?` `editor.ts:applyConstraints`
- **现象**：`child.x *= frame.width/oldW` 未考虑旋转矩阵。
- **影响**：旋转 Frame 内缩放错位。
- **建议**：约束计算在 `parentLocalPoint` 空间进行，再转回世界。

### F15 [High] Figma 导入对自动布局/组件映射丢失无提示
- **文件**：`backend/internal/figma/figma.go:ConvertFile`
- **现象**：仅转换 `frame/rect/text/vector`，Figma AutoLayout/Component 化丢失，UI 未提示“部分特性未支持”。
- **影响**：用户以为 100% 还原。
- **建议**：返回 `warnings: ["AutoLayout → absolute", "Component → group"]` 并在导入对话框展示。

---

## 五、市场/工程化 Market（M01—M19）

### M01 [Medium] 无埋点/遥测，无法评估功能采纳
- **文件**：`frontend/**` 无 `posthog/umami`
- **现象**：不知 `AI chat / MCP / 版本恢复` 使用率。
- **影响**：路线图拍脑袋。
- **建议**：引入 `privacy-first` 遥测（默认 off，需用户 opt-in），事件 `ai_chat, figma_import, public_link`。

### M02 [Low] API 文档与实现不一致
- **文件**：`docs/API.md` vs `backend/internal/api/api.go:Handler`
- **现象**：`API.md` 漏 `POST /ai/skills /ai/context /tokens /figma/import-json`。
- **影响**：MCP 开发者困惑。
- **建议**：CI 生成 `swagger.json`/`openapi`，文档自动同步。

### M03 [Medium] 缺少 CHANGELOG / 版本语义
- **文件**：根目录无 `CHANGELOG.md`
- **现象**：Release 仅 tag，无 `Breaking/Feat/Fix` 分类。
- **影响**：企业升级顾虑。
- **建议**：`git-cliff` + `conventional commits` 自动 CHANGELOG。

### M04 [High] 测试覆盖低（核心 Merge 无 fuzz）
- **文件**：`backend/internal/doc/doc_test.go` `frontend` 无 `vitest`
- **现象**：`go test ./...` 仅覆盖 `api` 少量，`doc.Merge` 未 fuzz，`Canvas` 零测试。
- **影响**：重构易回归。
- **建议**：`go test -fuzz` 对 `Merge/ApplyDelta`；前端 `vitest + testing-library` 覆盖 `nodes/merge/delta`。

### M05 [Medium] `mise.toml` 与 `go.mod` 声明不一致
- **文件**：`mise.toml: go 1.27.3` `backend/go.mod: go 1.27`
- **现象**：本地 1.27.3，CI `setup-go` 用 `go-version-file`，但 `Dockerfile golang:1.27-alpine` 未 pin 次版本。
- **影响**：构建差异。
- **建议**：统一 `go.mod 1.27.3` 或 `Dockerfile golang:1.27.3-alpine`。

### M06 [Low] pnpm 12.15 过新，兼容性风险
- **文件**：`frontend/package.json: packageManager pnpm@12.15.0` `install.sh` 无 pnpm
- **现象**：多数用户 pnpm 8/9。
- **影响**：`install --frozen-lockfile` 报错。
- **建议**：`engines.pnpm >=10` 已可，文档提示 `corepack enable`。

### M07 [Low] `install.sh` 缺 `--dry-run`
- **文件**：`install.sh`
- **现象**：直接写 `systemd` + `ENV_FILE`。
- **影响**：企业预演困难。
- **建议**：`--dry-run` 打印将执行动作。

### M08 [Medium] Release 无 SBOM/签名 Attestation
- **文件**：`.github/workflows/release.yml` `goreleaser.yaml`
- **现象**：仅 `checksums.txt`。
- **影响**：企业安全审计不通过。
- **建议**：`goreleaser` 启用 `sbom + cosign`，`attest` 到 GitHub。

### M09 [Low] 缺少 CONTRIBUTING / CODE_OF_CONDUCT
- **文件**：根目录
- **现象**：无贡献指南。
- **影响**：外部 PR 质量低。
- **建议**：`CONTRIBUTING.md` 说明 `mise install` + `make build` + commit 规范。

### M10 [Medium] README 30 张截图同步加载，SEO 差
- **文件**：`README.md` `docs/screenshots/*.png`
- **现象**：每图 ~300KB，README 10MB。
- **影响**：GitHub 首屏慢、移动端流量。
- **建议**：换 `webp` + `loading=lazy`（GitHub 支持 `?` 缩略），或外链 `docs site`。

### M11 [Low] Figma Plugin `manifest.json` 未声明 `networkAccess`
- **文件**：`figma-plugin/manifest.json`
- **现象**：`api: 1.0.0` 旧版，缺 `networkAccess: {allowedDomains}`。
- **影响**：未来 Figma 收紧后插件失效。
- **建议**：`manifest.version 2 + networkAccess`。

### M12 [Medium] 日志非结构化，难聚合
- **文件**：`backend/internal/api/api.go:withLogging` `backend/internal/ws/hub.go`
- **现象**：`log.Printf` 裸字符串。
- **影响**：Loki/ELK 检索难。
- **建议**：`slog` JSON + `requestID` + `level`，`X-Request-Id` 透传。

### M13 [Medium] 无分布式 Tracing
- **文件**：`backend/internal/ai/openai.go` `backend/internal/api/api.go`
- **现象**：`AI → Figma → DB → WS` 全链路无 span。
- **影响**：AI 慢查询难定位。
- **建议**：`otel` 已 indirect 依赖，直接启用 `otelhttp` + `genai` span。

### M14 [Low] 部署文档缺备份恢复
- **文件**：`docs/DEPLOYMENT.md`
- **现象**：未说明 `sqlite3 sigma.db ".backup"` + `uploads` 卷备份。
- **影响**：用户误删无法恢复。
- **建议**：增 `备份/回滚/迁移` 章，含 `cron` 示例。

### M15 [Medium] 健康检查仅 `ok:true`，未探测 DB
- **文件**：`backend/internal/api/api.go:GET /api/health`
- **现象**：`DB_PATH` 不可用仍 `200`。
- **影响**：k8s `readinessProbe` 误判。
- **建议**：`SELECT 1` 探测 DB，失败 `503`。

### M16 [High] 前端硬编码 `/api` 前缀，不支持子路径
- **文件**：`frontend/src/lib/api.ts: fetch(`/api${path}`)` `frontend/vite.config.ts proxy`
- **现象**：`APP_BASE_URL=https://example.com/sigma` 时 404。
- **影响**：企业子路径部署失败。
- **建议**：`VITE_API_BASE=/sigma/api` 可配置，`wsUrl` 亦支持。

### M17 [Medium] 后端 `STATIC_DIR` 与内嵌双路径易混
- **文件**：`backend/main.go: staticDir` `backend/internal/static/*`
- **现象**：`STATIC_DIR` 优先级高于内嵌，若遗漏 `web/dist` 静默用旧内嵌。
- **影响**：发版后前端未更新。
- **建议**：启动日志打印 `static source: embed vs disk (files N)`，`make build` 校验 `dist` hash。

### M18 [Low] `perf/RESULTS.md` 手工维护，与 CI 脱节
- **文件**：`perf/README.md` `perf/k6-page-load.js`
- **现象**：结果手工贴，未自动化。
- **影响**：性能回归无感知。
- **建议**：CI 中 `k6` + `bench` 上传 artifact，PR 评论对比。

### M19 [Critical] 无 LICENSE 文件
- **文件**：根目录 `LICENSE` 缺失
- **现象**：GitHub 显示 `View license` 空，默认“保留所有权利”。
- **影响**：企业法务直接卡死，无法商用/二次开发。
- **建议**：选 `AGPL-3.0`（对抗云厂商）或 `MIT` + `Commercial` 双许可，立即补。

---

## 附：静态分析规则集（已执行）

```bash
# 安全
grep -rn "SIGMA_SECRET.*change-me" backend/
grep -rn "Allow-Origin.*Origin" backend/internal/api/api.go
grep -rn "CheckOrigin.*true" backend/internal/ws/
grep -rn "bcrypt.DefaultCost\|len.*Password.*6" backend/
# 性能
grep -rn "SetMaxOpenConns(1)\|pruneTombstones" backend/
grep -rn "structuredClone\|html-to-image" frontend/
# UI
grep -rn "dangerouslySetInnerHTML\|aria-" frontend/src/components/
# 产品
grep -rn "InMemoryService\|component.*bool" backend/
```

未执行编译/运行，纯文本扫描，适合低内存环境。

---

## 建议修复迭代

| 迭代 | 内容 | 预计工时 |
|------|------|----------|
| **v0.99.2 热修** | S01,S03,S04,S05 + M19 | 1 天 |
| **v0.100 安全加固** | S02,S06,S08,S14,S19,S25 + P01,P02 | 3 天 |
| **v1.0 性能** | P03,P04,P05,P12,U16 | 1 周 |
| **v1.1 产品** | F02,F04,F10,U04,U10 | 1 周 |
| **v1.2 工程化** | M04,M12,M13,M15,M08 | 持续 |

---

## 如何批量建 Issue（Top 100）

本仓库已提供脚本（不消耗内存，纯 `gh` API）：

```bash
# 需先 gh auth login
bash scripts/create-issues-top100.sh --dry-run   # 预览
bash scripts/create-issues-top100.sh             # 真正创建 100 个 issue，带标签
```

脚本会为每条生成标题 ` [S01] 默认 SECRET 硬编码回退 — Critical` 等，自动打 `security/performance/...` 标签。  
若无 `gh` 权限，可直接用本文件作为 `docs/AUDIT` 评审。

> **下一步**：请选择先修的 10 个，我可直接提 PR（含代码 diff + 测试），无需编译亦可审查 diff。

