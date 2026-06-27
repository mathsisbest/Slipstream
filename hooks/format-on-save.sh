#!/usr/bin/env bash
# PostToolUse (Write|Edit): format the touched file with the stack's formatter, if installed.
#
# Recursion-safe by construction: it runs the formatter BINARY directly on the file. It never
# calls the Write/Edit tool, so it cannot trigger another PostToolUse. The marker below is a
# belt-and-suspenders guard in case this script is ever wired to fire on its own output.
set -euo pipefail

[ -n "${SLIPSTREAM_FMT:-}" ] && exit 0   # recursion guard
export SLIPSTREAM_FMT=1

input=$(cat)
fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$fp" ] && exit 0
[ -f "$fp" ] || exit 0

case "$fp" in
  *.py)
    command -v ruff >/dev/null 2>&1 && ruff format "$fp" >/dev/null 2>&1 || true ;;
  *.js|*.jsx|*.ts|*.tsx|*.json|*.css|*.scss|*.md|*.html)
    if command -v biome >/dev/null 2>&1; then biome format --write "$fp" >/dev/null 2>&1 || true
    elif command -v prettier >/dev/null 2>&1; then prettier --write "$fp" >/dev/null 2>&1 || true; fi ;;
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$fp" >/dev/null 2>&1 || true ;;
  *.rs)
    command -v rustfmt >/dev/null 2>&1 && rustfmt "$fp" >/dev/null 2>&1 || true ;;
  *.dart)
    command -v dart >/dev/null 2>&1 && dart format "$fp" >/dev/null 2>&1 || true ;;
esac

exit 0
