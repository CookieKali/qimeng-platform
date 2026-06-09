#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.run/backend.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No backend pid file ($PID_FILE)"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "Stopped backend (pid $PID)"
else
  echo "Backend pid $PID not running"
fi
rm -f "$PID_FILE"

# 清理占用 8000 端口的残留进程（pid 文件过期时）
if command -v lsof >/dev/null 2>&1; then
  PORT_PIDS="$(lsof -ti :8000 2>/dev/null || true)"
  if [ -n "$PORT_PIDS" ]; then
    echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
    echo "Freed port 8000"
  fi
fi
