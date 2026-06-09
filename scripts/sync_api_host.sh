#!/usr/bin/env bash
# 将本机局域网 IP 写入小程序 config.local.js，供真机调试访问后端
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$PROJECT_ROOT/qimeng-miniprogram/config.local.js"

IP=""
if command -v ipconfig >/dev/null 2>&1; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [ -z "$IP" ]; then
    IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
fi
if [ -z "$IP" ] && command -v hostname >/dev/null 2>&1; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
if [ -z "$IP" ]; then
  IP="localhost"
fi

cat >"$OUT" <<EOF
// 由 scripts/sync_api_host.sh 自动生成，请勿手改（可重新运行脚本刷新）
module.exports = {
  apiBase: 'http://${IP}:8000'
}
EOF

echo "MiniProgram API base -> http://${IP}:8000"
echo "Written: $OUT"
