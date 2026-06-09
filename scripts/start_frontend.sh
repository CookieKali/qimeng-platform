#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Web frontend has been replaced by the WeChat miniprogram."
echo "Import this directory in WeChat DevTools:"
echo "  $PROJECT_ROOT/qimeng-miniprogram"
echo ""
echo "Start the backend first:"
echo "  $PROJECT_ROOT/scripts/start_backend.sh"
