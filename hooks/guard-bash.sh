#!/usr/bin/env bash
# PreToolUse (Bash): block destructive commands; ask before installing a new dependency.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# Clearly destructive or pipe-to-shell → deny outright.
if printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+-rf[[:space:]]+/|mkfs|dd[[:space:]]+if=|(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(sh|bash)'; then
  decide deny "Blocked: destructive or pipe-to-shell command. If this is truly intended, run it yourself."
fi

# New dependency install → escalate to the human (supply-chain check).
if printf '%s' "$cmd" | grep -Eq '(npm|pnpm|yarn)[[:space:]]+(install|add)[[:space:]]+[^-]|pip[[:space:]]+install[[:space:]]+[^-]|cargo[[:space:]]+add[[:space:]]|go[[:space:]]+get[[:space:]]|brew[[:space:]]+install[[:space:]]'; then
  decide ask "Installing a dependency — confirm first (supply-chain check). Plain reinstalls (no package name) aren't affected."
fi

exit 0
