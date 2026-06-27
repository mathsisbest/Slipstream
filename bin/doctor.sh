#!/usr/bin/env bash
# Slipstream doctor — checks your environment is ready and flags the metered-billing trap.
set -euo pipefail

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

problems=0

echo "Slipstream doctor"
echo

# git
if command -v git >/dev/null 2>&1; then ok "git: $(git --version | awk '{print $3}')"
else bad "git not found — install it first"; problems=$((problems+1)); fi

# a runtime CLI
runtime=""
command -v claude >/dev/null 2>&1 && runtime="claude"
command -v codex  >/dev/null 2>&1 && runtime="${runtime:+$runtime, }codex"
if [ -n "$runtime" ]; then ok "runtime CLI: $runtime"
else bad "no runtime CLI found — install Claude Code (\`claude\`) or Codex (\`codex\`)"; problems=$((problems+1)); fi

# node (the orchestrator workflow is JS)
if command -v node >/dev/null 2>&1; then ok "node: $(node --version)"
else warn "node not found — needed only for workflows/project-builder.js"; fi

# the billing trap
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY is set — Claude Code will use this key and BILL YOU per token"
  warn "  unset it to use your subscription:  unset ANTHROPIC_API_KEY"
  problems=$((problems+1))
else
  ok "ANTHROPIC_API_KEY not set — runtime will use your subscription"
fi

# in a git repo?
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then ok "inside a git repository"
else warn "not inside a git repository — run this from your project"; fi

echo
if [ "$problems" -eq 0 ]; then
  echo "All good. Next: docs/QUICKSTART.md"
else
  echo "$problems thing(s) to fix above, then re-run."
  exit 1
fi
