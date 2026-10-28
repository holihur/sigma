#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
exec env \
  PORT="${E2E_PORT:-19123}" \
  STATIC_DIR="../frontend/dist" \
  UPLOAD_DIR="${E2E_UPLOAD_DIR:-/tmp/sigma-e2e-uploads}" \
  SIGMA_SECRET="${SIGMA_SECRET:-sigma-e2e-secret}" \
  AUTO_UPDATE=false \
  GO_ENV="${GO_ENV:-development}" \
  MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}" \
  MONGO_DB="${MONGO_DB:-sigma_e2e}" \
  go run .
