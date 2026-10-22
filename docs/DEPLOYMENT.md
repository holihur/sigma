# 部署指南

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `9000` | HTTP 端口 |
| `DB_PATH` | `data/sigma.db` | SQLite 文件 |
| `UPLOAD_DIR` | 数据库同级 `uploads/` | 图片存储目录 |
| `STATIC_DIR` | 自动探测 | 前端静态目录；release 二进制可内嵌前端 |
| `SIGMA_SECRET` | 开发默认值 | JWT 签名 + BYOK Key 加密；生产必须固定且保密 |
| `APP_BASE_URL` | `http://localhost:9000` | OIDC 回调 / 前端跳转基地址 |
| `OIDC_ISSUER` | 空 | 启用 OIDC 时填写 Provider Issuer |
| `OIDC_CLIENT_ID` | 空 | OIDC Client ID |
| `OIDC_CLIENT_SECRET` | 空 | OIDC Client Secret（公共客户端可留空） |
| `OIDC_REDIRECT_URL` | `APP_BASE_URL/api/auth/oidc/callback` | 回调地址 |
| `OIDC_SCOPES` | `openid profile email` | 空格分隔 |
| `OIDC_LABEL` | `Single sign-on` | 登录按钮文案 |
| `AUTO_UPDATE` | `true` | 是否自动检查并安装更新 |
| `AUTO_UPDATE_INTERVAL` | `10m` | 检查间隔，最小 30s |
| `SIGMA_UPDATE_REPO` | `holihur/sigma` | Release 仓库 |
| `SIGMA_UPDATE_API` | `https://api.github.com` | GitHub API（可指向镜像） |
| `GITHUB_TOKEN` | 空 | 避免 API 限流 |
| `SIGMA_ADMIN_EMAILS` | 空 | 逗号分隔的实例管理员邮箱；只有管理员可查看/触发系统更新 |
| `SIGMA_ALLOW_DEV_UPDATE` | 空 | 允许 dev 构建自更新（默认拒绝，防止覆盖开发二进制） |
| `FIGMA_API_BASE` | `https://api.figma.com` | Figma API 地址 |
| `VITE_API_PROXY` | `http://localhost:9000` | 仅 Vite 开发代理 |

## 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/holihur/sigma/main/install.sh | bash
```

可选：

```bash
# 固定版本
SIGMA_VERSION=v1.4.0 bash install.sh
# 自定义端口 / 数据目录
bash install.sh --port 8080 --home /srv/sigma
# 不注册 systemd
bash install.sh --no-service
# 使用内网镜像（目录需包含 sigma-<os>-<arch> 与 checksums.txt）
SIGMA_RELEASE_BASE=https://mirror.example/sigma bash install.sh
```

脚本会校验 Release 的 `checksums.txt`，安装到：

| 场景 | 二进制 | 数据 / 配置 | 服务 |
| --- | --- | --- | --- |
| root | `/var/lib/sigma/bin/sigma` | `/var/lib/sigma`、`/etc/sigma/sigma.env` | `/etc/systemd/system/sigma.service` |
| 非 root | `~/.local/bin/sigma` | `~/.sigma` | `~/.config/systemd/user/sigma.service` |

root 安装会创建系统用户 `sigma`，服务以该用户运行。二进制位于数据目录内，因此自更新可写。

## systemd

示例 unit 在 `deploy/`：

```bash
sudo cp deploy/sigma.service /etc/systemd/system/sigma.service
sudo systemctl daemon-reload
sudo systemctl enable --now sigma
```

常用命令：

```bash
systemctl status sigma
journalctl -u sigma -f
systemctl restart sigma
```

用户服务：

```bash
cp deploy/sigma.user.service ~/.config/systemd/user/sigma.service
systemctl --user daemon-reload
systemctl --user enable --now sigma
loginctl enable-linger "$USER"
```

## 自动更新

> `GET /api/system/update`、`check`、`apply` 仅对 `SIGMA_ADMIN_EMAILS` 中的实例管理员开放。自动更新本身由服务端执行，不依赖普通用户点击。

服务启动后默认每 10 分钟：

1. 请求 GitHub `releases/latest`。
2. 根据 `GOOS/GOARCH` 选择 `sigma-<os>-<arch>`。
3. 下载并校验 `checksums.txt` 中的 SHA-256。
4. 原子替换当前二进制（保留 `.old` 以便启动清理）。
5. `exec` 重启进程；systemd 的 `Restart=always` 作为兜底。

关闭：

```bash
AUTO_UPDATE=false
```

调整间隔：

```bash
AUTO_UPDATE_INTERVAL=30m
```

开发构建（`version=dev`）默认只检查不自动覆盖，设置 `SIGMA_ALLOW_DEV_UPDATE=1` 可强制。

> Docker 镜像不可变，`docker-compose.yml` 默认关闭自更新；更新请拉取新镜像。

## 反向代理

Nginx 示例：

```nginx
server {
  listen 443 ssl http2;
  server_name sigma.example.com;

  client_max_body_size 32m;

  location / {
    proxy_pass http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
  }
}
```

WebSocket 必须透传 `Upgrade` / `Connection`。HTTPS 下设置：

```bash
APP_BASE_URL=https://sigma.example.com
```

首次注册管理员后，把邮箱写入环境变量：

```bash
SIGMA_ADMIN_EMAILS="you@company.com,ops@company.com"
```

## OIDC

1. 在 Provider（Keycloak、Auth0、Okta、Google Workspace、Entra ID 等）创建 Web Client。
2. Redirect URI：`https://sigma.example.com/api/auth/oidc/callback`。
3. Scope：`openid profile email`。
4. 设置环境变量并重启。

首次 SSO 登录：

- 按 `(issuer, subject)` 查找身份。
- 未找到时按邮箱匹配已有用户；仍不存在则自动创建账号（随机密码，不能密码登录）。
- 写入 `user_identities` 绑定。

## 发布流程

Release **只在 GitHub CI** 中由 GoReleaser 发布；本地不要执行 `goreleaser release`。

```bash
git tag v1.4.0
git push origin v1.4.0
```

推送 tag 或在 GitHub Actions 手动触发 `Release` workflow。`.github/workflows/release.yml` 会：

1. 构建前端。
2. 复制到 `backend/internal/static/dist`。
3. `go test ./...`。
4. GoReleaser 以 `-tags embed_static` 构建 Linux / macOS amd64 / arm64 单二进制。
5. 上传 `sigma-linux-amd64`、`sigma-darwin-arm64` 等原始二进制与 `checksums.txt`。

本地只做 snapshot 验证（不会发布）：

```bash
make release-snapshot
```

需要安装 GoReleaser v2。正式 Release 必须由 GitHub CI 执行。

## 备份

备份以下内容即可：

```text
sigma.db
sigma.db-wal
sigma.db-shm
uploads/
```

SQLite 使用 WAL。在线备份建议：

```bash
sqlite3 sigma.db ".backup '/backup/sigma-$(date +%F).db'"
```
