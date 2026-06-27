#!/usr/bin/env bash
# Stop: let you know the agent finished a turn. macOS notification; silent no-op elsewhere.
set -euo pipefail
if command -v osascript >/dev/null 2>&1; then
  osascript -e 'display notification "Agent finished a turn" with title "Slipstream"' >/dev/null 2>&1 || true
fi
exit 0
