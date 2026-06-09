#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
VENV_DIR="$PROJECT_ROOT/.venv"
RUN_DIR="$PROJECT_ROOT/.run"
PID_FILE="$RUN_DIR/backend.pid"
LOG_FILE="$RUN_DIR/backend.log"
REQ_HASH_FILE="$RUN_DIR/backend.requirements.sha"

mkdir -p "$RUN_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend is already running on http://127.0.0.1:8000"
  exit 0
fi

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

CURRENT_HASH="$(shasum "$BACKEND_DIR/requirements.txt" | awk '{print $1}')"
INSTALLED_HASH="$(cat "$REQ_HASH_FILE" 2>/dev/null || true)"

if [ "$CURRENT_HASH" != "$INSTALLED_HASH" ] || ! "$VENV_DIR/bin/python" -c "import fastapi, uvicorn, sqlalchemy, pydantic_settings" >/dev/null 2>&1; then
  "$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
  echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
fi

cd "$BACKEND_DIR"
# 0.0.0.0 以便手机真机通过局域网访问
nohup "$VENV_DIR/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

"$PROJECT_ROOT/scripts/sync_api_host.sh" || true

echo "Backend started (simulator): http://127.0.0.1:8000"
echo "Backend started (real device): see qimeng-miniprogram/config.local.js"
echo "Swagger docs: http://127.0.0.1:8000/docs"
echo "Log file: $LOG_FILE"
