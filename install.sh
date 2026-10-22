#!/usr/bin/env bash
# Sigma one-click installer / updater.
#   curl -fsSL https://raw.githubusercontent.com/holihur/sigma/main/install.sh | bash
# Environment:
#   SIGMA_VERSION=v1.2.3   pin a release (default: latest)
#   SIGMA_PORT=9000         HTTP port
#   SIGMA_SERVICE=auto      auto | yes | no
#   SIGMA_HOME              data directory
#   SIGMA_BIN_DIR           binary directory
#   SIGMA_REPO              GitHub repo (default holihur/sigma)
set -euo pipefail

REPO="${SIGMA_REPO:-holihur/sigma}"
VERSION="${SIGMA_VERSION:-latest}"
PORT="${SIGMA_PORT:-9000}"
SERVICE="${SIGMA_SERVICE:-auto}"
ROOT=0
[ "$(id -u)" -eq 0 ] && ROOT=1

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --no-service) SERVICE=no; shift ;;
    --service) SERVICE=yes; shift ;;
    --home) SIGMA_HOME="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
need curl

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$os" in
  linux|darwin) ;;
  *) echo "Unsupported OS: $os (release builds support Linux and macOS)" >&2; exit 1 ;;
esac
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac
asset="sigma-${os}-${arch}"

if [ "$VERSION" = "latest" ]; then
  echo "→ Resolving latest Sigma release…"
  api="https://api.github.com/repos/${REPO}/releases/latest"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    json="$(curl -fsSL --retry 3 -H "Authorization: Bearer ${GITHUB_TOKEN}" -H 'Accept: application/vnd.github+json' "$api")"
  else
    json="$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "$api")"
  fi
  tag="$(printf '%s' "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$tag" ] || { echo "Could not determine latest release tag" >&2; exit 1; }
else
  tag="$VERSION"
  case "$tag" in v*) ;; *) tag="v$tag" ;; esac
fi

echo "→ Installing Sigma ${tag} (${asset})"
base="https://github.com/${REPO}/releases/download/${tag}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 --progress-bar "${base}/${asset}" -o "${tmp}/${asset}"
curl -fL --retry 3 "${base}/checksums.txt" -o "${tmp}/checksums.txt"
expected="$(awk -v a="$asset" '$NF==a || $NF=="*"a {print $1}' "${tmp}/checksums.txt" | head -1)"
[ -n "$expected" ] || { echo "No checksum found for ${asset}" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp}/${asset}" | awk '{print $1}')"
else
  actual="$(shasum -a 256 "${tmp}/${asset}" | awk '{print $1}')"
fi
[ "$expected" = "$actual" ] || { echo "Checksum mismatch for ${asset}" >&2; exit 1; }
chmod 0755 "${tmp}/${asset}"

if [ "$ROOT" -eq 1 ]; then
  SIGMA_HOME="${SIGMA_HOME:-/var/lib/sigma}"
  BIN_DIR="${SIGMA_BIN_DIR:-$SIGMA_HOME/bin}"
  CONF_DIR="/etc/sigma"
  ENV_FILE="$CONF_DIR/sigma.env"
  UNIT="/etc/systemd/system/sigma.service"
  RUN_USER="sigma"
  if ! id "$RUN_USER" >/dev/null 2>&1; then
    useradd --system --home "$SIGMA_HOME" --shell /usr/sbin/nologin "$RUN_USER" 2>/dev/null || true
  fi
else
  SIGMA_HOME="${SIGMA_HOME:-$HOME/.sigma}"
  BIN_DIR="${SIGMA_BIN_DIR:-$HOME/.local/bin}"
  CONF_DIR="$SIGMA_HOME"
  ENV_FILE="$SIGMA_HOME/sigma.env"
  UNIT="$HOME/.config/systemd/user/sigma.service"
  RUN_USER="$(id -un)"
fi
mkdir -p "$SIGMA_HOME/uploads" "$BIN_DIR" "$CONF_DIR"

secret=""
if [ -f "$ENV_FILE" ]; then
  secret="$(sed -n 's/^SIGMA_SECRET=//p' "$ENV_FILE" | head -1)"
fi
if [ -z "$secret" ]; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
  else
    secret="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
fi
umask 077
cat > "$ENV_FILE" <<ENV
PORT=${PORT}
DB_PATH=${SIGMA_HOME}/sigma.db
UPLOAD_DIR=${SIGMA_HOME}/uploads
SIGMA_SECRET=${secret}
AUTO_UPDATE=true
AUTO_UPDATE_INTERVAL=10m
ENV
if [ "$ROOT" -eq 1 ]; then
  chown -R "$RUN_USER:$RUN_USER" "$SIGMA_HOME"
  chown root:root "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

# Stop an existing service before replacing the running binary.
if [ "$ROOT" -eq 1 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl stop sigma 2>/dev/null || true
elif [ "$ROOT" -eq 0 ] && command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  systemctl --user stop sigma 2>/dev/null || true
fi

install -m 0755 "${tmp}/${asset}" "${BIN_DIR}/sigma"
[ "$ROOT" -eq 1 ] && chown "$RUN_USER:$RUN_USER" "${BIN_DIR}/sigma"

can_systemd=0
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  if [ "$ROOT" -eq 1 ] || systemctl --user show-environment >/dev/null 2>&1; then
    can_systemd=1
  fi
fi

if [ "$SERVICE" != "no" ] && [ "$can_systemd" -eq 1 ]; then
  mkdir -p "$(dirname "$UNIT")"
  if [ "$ROOT" -eq 1 ]; then
    cat > "$UNIT" <<UNIT
[Unit]
Description=Sigma collaborative design
Documentation=https://github.com/${REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${SIGMA_HOME}
EnvironmentFile=${ENV_FILE}
ExecStart=${BIN_DIR}/sigma
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${SIGMA_HOME}
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now sigma
  else
    cat > "$UNIT" <<UNIT
[Unit]
Description=Sigma collaborative design
Documentation=https://github.com/${REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${SIGMA_HOME}
EnvironmentFile=${ENV_FILE}
ExecStart=${BIN_DIR}/sigma
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable --now sigma
    loginctl enable-linger "$(id -un)" 2>/dev/null || true
  fi
  echo "✓ Sigma is running as a systemd service: ${UNIT}"
else
  # No systemd (containers, minimal hosts): run in the background.
  pidfile="$SIGMA_HOME/sigma.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    sleep 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  nohup "$BIN_DIR/sigma" >> "$SIGMA_HOME/sigma.log" 2>&1 &
  echo $! > "$pidfile"
  echo "✓ Sigma started in the background (PID $(cat "$pidfile"), log $SIGMA_HOME/sigma.log)"
fi

echo
echo "  Sigma is ready:  http://localhost:${PORT}"
echo "  Data:            ${SIGMA_HOME}"
echo "  Config:          ${ENV_FILE}"
echo "  Auto-update:     every 10 minutes (set AUTO_UPDATE=false to disable)"
echo "  Demo login:      demo@sigma.design / demo1234"
