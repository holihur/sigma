#!/usr/bin/env bash
# Sigma Top100 issue creator — 静态审计转 GitHub Issues（不编译）
# 用法: GH_TOKEN=xxx bash scripts/create-issues-top100.sh [--dry-run] [--repo holihur/sigma]
set -euo pipefail
REPO="${REPO:-holihur/sigma}"
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; fi
if [[ "${1:-}" == "--repo" ]]; then REPO="$2"; shift 2; fi
if [[ "${2:-}" == "--repo" ]]; then REPO="$3"; fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1 (brew install gh)"; exit 1; }; }
need gh

# 若未登录，提示
if ! gh auth status >/dev/null 2>&1; then
  echo "gh not authenticated. Run: gh auth login -h github.com"
  echo "或设置 GH_TOKEN + gh auth login --with-token < token.txt"
  if [[ $DRY_RUN -eq 0 ]]; then exit 1; fi
fi

# 100 条标题与标签（与 AUDIT_TOP100.md 同步）
declare -a ISSUES=(
"S01|Security|Critical|默认 SIGMA_SECRET 硬编码回退导致 JWT 伪造|backend/main.go:36"
"S02|Security|Critical|JWT 30天无撤销机制|backend/internal/auth/auth.go:35"
"S03|Security|Critical|CORS 任意源反射 + 凭证|backend/internal/api/api.go:186"
"S04|Security|Critical|WebSocket CheckOrigin true 任意源劫持|backend/internal/ws/hub.go:84"
"S05|Security|Critical|全站无速率限制可暴力|backend/internal/api/api.go:Handler"
"S06|Security|High|密码策略仅6位|backend/internal/api/auth_handlers.go:47"
"S07|Security|High|注册邮箱未验证|backend/internal/api/auth_handlers.go:handleRegister"
"S08|Security|High|AES 密钥派生用 SHA256 非 KDF|backend/internal/ai/crypto.go:15"
"S09|Security|High|readJSON 64MB 过大|backend/internal/api/api.go:325"
"S10|Security|High|文档节点数无限|backend/internal/doc/doc.go:Merge"
"S11|Security|High|WS ReadLimit 48MB|backend/internal/ws/hub.go:146"
"S12|Security|Medium|上传仅校验 MIME可伪造|backend/internal/api/upload_handlers.go:34"
"S13|Security|Medium|上传无配额|backend/internal/api/upload_handlers.go"
"S14|Security|High|OIDC 未校验 email_verified|backend/internal/auth/oidc.go:227"
"S15|Security|Medium|SSO 账号仍可密码登录|backend/internal/api/oidc_handlers.go:77"
"S16|Security|Low|PAT hash 无盐SHA256|backend/internal/auth/pat.go:36"
"S17|Security|Medium|过期 PAT 未清理|backend/internal/store/store.go:PATByHash"
"S18|Security|High|缺 CSP/HSTS 等安全头|backend/internal/api/api.go:spaFSHandler"
"S19|Security|High|Token 存 localStorage 易 XSS|frontend/src/lib/api.ts:23"
"S20|Security|High|评论/文本存储 XSS 隐患|frontend/src/components/editor/NodeView.tsx"
"S21|Security|Medium|MCP url 未校验 scheme|backend/internal/design/model.go:Link"
"S22|Security|Medium|错误泄露内部细节|backend/internal/api/*.go:writeError"
"S23|Security|Low|Admin 邮箱空串未提示|backend/internal/api/api.go:parseAdminEmails"
"S24|Security|High|静态资源无 SRI|frontend/index.html"
"S25|Security|Critical|自更新可回滚无 Downgrade 保护|backend/internal/update/update.go:versionGreater"
"S26|Security|Medium|install.sh 无签名仅 SHA256|install.sh:90"
"S27|Security|Medium|docker-compose 默认 SECRET 弱|docker-compose.yml:17"
"S28|Security|Low|BREACH gzip 含敏感字段|backend/internal/api/api.go:gzipEligible"
"S29|Security|Medium|日志可能泄露 token|backend/internal/api/figma_handlers.go"
"S30|Security|Medium|缺审计日志|backend/internal/api/file_handlers.go"
"P01|Performance|Critical|SQLite 单连接瓶颈|backend/internal/store/store.go:26"
"P02|Performance|High|pruneTombstones 空实现膨胀|backend/internal/api/file_handlers.go:268"
"P03|Performance|High|cloneDoc/structuredClone 深拷贝阻塞|backend/internal/doc/doc.go + frontend/src/store/editor.ts"
"P04|Performance|High|Canvas 全量重渲染|frontend/src/components/editor/Canvas.tsx"
"P05|Performance|High|缩略图 html-to-image 主线程阻塞|frontend/src/pages/Editor.tsx:captureThumbnail"
"P06|Performance|Medium|Dashboard 全量拉 ListFiles 无分页|backend/internal/store/store.go:ListFiles"
"P07|Performance|Medium|gzip.Writer 无池复用|backend/internal/api/api.go:gzipResponseWriter"
"P08|Performance|Medium|WS 广播持锁遍历|backend/internal/ws/hub.go:broadcastDoc"
"P09|Performance|Medium|Figma 90s 超时+96MB缓冲|backend/internal/figma/figma.go:31"
"P10|Performance|Medium|update 下载 512MB 未限速|backend/internal/update/update.go:397"
"P11|Performance|Low|Dashboard 搜索无 debounce|frontend/src/pages/Dashboard.tsx:visible"
"P12|Performance|High|AutoLayout 全量 reflow|frontend/src/store/editor.ts:reflowPage"
"P13|Performance|Low|Vite 无 manualChunks|frontend/vite.config.ts"
"P14|Performance|Medium|LayersPanel 线性搜索|frontend/src/components/editor/LayersPanel.tsx"
"P15|Performance|High|矢量引擎同步 import 阻塞首屏|frontend/src/lib/vector-ops.ts"
"P16|Performance|High|WAL 单连接 VACUUM 阻塞|backend/internal/store/store.go:17"
"U01|UX|High|色彩对比度 WWAG AA 失败|frontend/src/index.css"
"U02|UX|High|命令面板 Windows 快捷键显示错误|frontend/src/pages/Editor.tsx:keydown"
"U03|UX|Medium|Dashboard 空状态缺引导|frontend/src/pages/Dashboard.tsx"
"U04|UX|Medium|删除确认缺上下文|frontend/src/pages/Dashboard.tsx:deleteTarget"
"U05|UX|Medium|移动端工具栏遮挡画布|frontend/src/components/editor/Toolbar.tsx:136"
"U06|UX|Medium|深色模式 FOUC|frontend/src/store/theme.ts:6"
"U07|UX|High|矢量手柄 12px 命中过小|frontend/src/components/editor/Canvas.tsx:vector-handle"
"U08|UX|Medium|通知已读乐观未回滚|frontend/src/pages/Dashboard.tsx:openNotifications"
"U09|UX|Medium|公开原型缺 OGP|frontend/src/pages/PublicPrototype.tsx"
"U10|UX|High|无骨架屏|frontend/src/App.tsx:Splash"
"U11|UX|Medium|评论锚点无磁吸|frontend/src/components/editor/CommentsPanel.tsx"
"U12|UX|Medium|文本编辑 textarea 行高跳变|frontend/src/components/editor/NodeView.tsx:TextEditor"
"U13|UX|Low|快捷键在 select 内误触|frontend/src/pages/Editor.tsx:isEditableTarget"
"U14|UX|Medium|选择工具栏边缘被裁|frontend/src/components/editor/SelectionToolbar.tsx"
"U15|UX|Low|字体列表未虚拟化|frontend/src/components/editor/PropertiesPanel.tsx"
"U16|UX|Medium|撤销历史无分组|frontend/src/store/editor.ts:past.slice"
"U17|UX|Medium|缩略图 dataUrl 存 DB 过大|backend/internal/store/store.go:SetThumbnail"
"U18|UX|Low|i18n 大文件同步加载|frontend/src/i18n/index.ts"
"U19|UX|Medium|原型热区无预览|frontend/src/components/editor/PreviewMode.tsx:388"
"U20|UX|Medium|LanguageToggle 样式不统一|frontend/src/components/LanguageToggle.tsx"
"F01|Product|Critical|组件承诺夸大仅单层同步|README.md + frontend/src/store/editor.ts:syncInstances"
"F02|Product|High|文本并发 LWW 丢字|backend/internal/doc/doc.go:Merge"
"F03|Product|Medium|版本无 Diff 预览|frontend/src/components/editor/VersionHistoryDialog.tsx"
"F04|Product|High|AI 会话内存重启丢失|backend/internal/api/api.go:InMemoryService"
"F05|Product|Medium|AI create_frame 循环父子|backend/internal/design/model.go:Page.Add"
"F06|Product|Medium|本地样式无团队库|frontend/src/components/editor/StylesDialog.tsx"
"F07|Product|Medium|约束与 AutoLayout 互斥未禁|frontend/src/store/editor.ts:reflowNode"
"F08|Product|Low|图片 objectFit 未记忆|frontend/src/components/editor/PropertiesPanel.tsx"
"F09|Product|Low|文件夹同名未去重|frontend/src/pages/Dashboard.tsx:folders"
"F10|Product|High|公开链接无过期/密码|backend/internal/store/store.go:SetPublicLink"
"F11|Product|Medium|评论仅一级无 thread 折叠|frontend/src/components/editor/CommentsPanel.tsx"
"F12|Product|Medium|MCP list_files 无分页|backend/internal/api/mcp_handlers.go"
"F13|Product|Low|模板加载失败静默|backend/main.go:seedDemo"
"F14|Product|Medium|约束 scale 旋转错误|frontend/src/store/editor.ts:applyConstraints"
"F15|Product|High|Figma 导入丢失无提示|backend/internal/figma/figma.go:ConvertFile"
"M01|Market|Medium|无埋点|frontend/**"
"M02|Market|Low|API 文档不一致|docs/API.md"
"M03|Market|Medium|缺 CHANGELOG|根目录"
"M04|Market|High|测试覆盖低|backend/internal/doc/doc_test.go"
"M05|Market|Medium|mise/go.mod 版本不一致|mise.toml + backend/go.mod"
"M06|Market|Low|pnpm 12.15 过新|frontend/package.json"
"M07|Market|Low|install.sh 缺 dry-run|install.sh"
"M08|Market|Medium|Release 无 SBOM 签名|goreleaser.yaml"
"M09|Market|Low|缺 CONTRIBUTING|根目录"
"M10|Market|Medium|README 30 图无 lazy|README.md"
"M11|Market|Low|Figma manifest networkAccess|figma-plugin/manifest.json"
"M12|Market|Medium|日志非结构化|slog"
"M13|Market|Medium|无 tracing|otel"
"M14|Market|Low|部署缺备份说明|docs/DEPLOYMENT.md"
"M15|Market|Medium|健康检查未探 DB|backend/internal/api/api.go:GET health"
"M16|Market|High|前端硬编码 /api 不支持子路径|frontend/src/lib/api.ts"
"M17|Market|Medium|STATIC_DIR 双路径易混|backend/main.go:staticDir"
"M18|Market|Low|perf 结果手工维护|perf/RESULTS.md"
"M19|Market|Critical|无 LICENSE|根目录"
)

created=0
for entry in "${ISSUES[@]}"; do
  IFS='|' read -r id cat sev title file <<< "$entry"
  label=$(echo "$cat" | tr '[:upper:]' '[:lower:]')
  sevLabel=$(echo "$sev" | tr '[:upper:]' '[:lower:]')
  fullTitle="[$id] $title — $sev"
  body="**类别**：$cat / $sev
**文件**：\`$file\`
**来源**：静态审计 AUDIT_TOP100.md
**描述**：详见 AUDIT_TOP100.md 中的 $id 条目

> 本 issue 由 scripts/create-issues-top100.sh 自动生成（不编译，低内存模式）"
  echo "[$created] $fullTitle ($label,$sevLabel) -> $file"
  if [[ $DRY_RUN -eq 1 ]]; then
    continue
  fi
  # 创建 issue
  if gh issue create --repo "$REPO" --title "$fullTitle" --body "$body" --label "$label,$sevLabel" >/dev/null 2>&1; then
    created=$((created+1))
    sleep 0.6
  else
    # 无标签时退化为不带标签创建
    if gh issue create --repo "$REPO" --title "$fullTitle" --body "$body" >/dev/null 2>&1; then
      created=$((created+1))
      sleep 0.6
    else
      echo "  -> failed to create $id"
    fi
  fi
done

echo "Done. DryRun=$DRY_RUN, repo=$REPO. See AUDIT_TOP100.md for details."
echo "若要真实创建 100 个 issue: bash scripts/create-issues-top100.sh --repo holihur/sigma"
