#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/stop_backend.sh" || true
exec "$ROOT/scripts/start_backend.sh"
