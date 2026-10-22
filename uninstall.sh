#!/usr/bin/env bash
# Stop and remove the Sigma systemd service. Data is kept by default.
set -euo pipefail
ROOT=0
[ "$(id -u)" -eq 0 ] && ROOT=1
if [ "$ROOT" -eq 1 ]; then
  systemctl disable --now sigma 2>/dev/null || true
  rm -f /etc/systemd/system/sigma.service
  systemctl daemon-reload 2>/dev/null || true
  echo "Removed /etc/systemd/system/sigma.service. Data in /var/lib/sigma was kept."
else
  systemctl --user disable --now sigma 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/sigma.service"
  systemctl --user daemon-reload 2>/dev/null || true
  echo "Removed the user service. Data in $HOME/.sigma was kept."
fi
