#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$PROJECT_ROOT/scripts/start_backend.sh"

echo ""
echo "Qimeng Platform backend is running."
echo "Backend:    http://127.0.0.1:8000"
echo "API Docs:   http://127.0.0.1:8000/docs"
echo ""
echo "WeChat miniprogram:"
echo "  1. Open WeChat DevTools"
echo "  2. Import directory: $PROJECT_ROOT/qimeng-miniprogram"
echo "  3. Enable '不校验合法域名' for local API"
echo "  4. Login: 123456 / 123456"
