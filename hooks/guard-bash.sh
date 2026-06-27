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
# These are best-effort pattern guards, not a sandbox: a determined command can still slip
# through. The point is to stop the common accidents the agent is most likely to emit.
#
# rm: recursive AND force, in any flag order (-rf, -fr, -r -f, -rfv, ...), aimed at a
#     high-risk target (/, ~, $HOME, *, or a relative path starting with .). The leading
#     boundary keeps it from firing inside words like "confirm".
rm_rf='(^|[^[:alnum:]_])rm[[:space:]]+.*(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR]|-[rR][[:space:]]+-[a-zA-Z]*f|-f[[:space:]]+-[a-zA-Z]*[rR]).*[[:space:]](/|~|\$HOME|\*|\.)'
# Other irreversible disk operations.
destructive='mkfs|dd[[:space:]]+if='
# Pipe-to-shell: curl/wget piped — through any number of intermediate stages — into an
# interpreter (sh/bash/zsh/dash/python[3], with or without a /bin or /usr/bin prefix), or
# into a base64 decode (the usual obfuscation step before exec).
pipe_shell='(curl|wget).*\|[[:space:]]*(sudo[[:space:]]+)?((/usr)?/bin/)?(sh|bash|zsh|dash|python3?)([[:space:]]|$|;|&|\|)|(curl|wget).*\|.*base64[[:space:]]+-d'

if printf '%s' "$cmd" | grep -Eq "$rm_rf|$destructive|$pipe_shell"; then
  decide deny "Blocked: destructive or pipe-to-shell command. If this is truly intended, run it yourself."
fi

# New dependency install → escalate to the human (supply-chain check).
# Match the verb (install / i / add) regardless of any flags that follow it, but require a
# real package/value argument so plain reinstalls (npm install, npm i, npm ci, yarn) stay
# untouched. The flag-skip group eats leading flags like -g / --save-dev / --extra-index-url.
dep_verb='(npm|pnpm|yarn)[[:space:]]+(install|i|add)|pip3?[[:space:]]+install|cargo[[:space:]]+add|go[[:space:]]+get|brew[[:space:]]+install'
dep_pkg='[[:space:]]+(-[^[:space:]]*[[:space:]]+)*[^-[:space:]]'
if printf '%s' "$cmd" | grep -Eq "($dep_verb)$dep_pkg"; then
  decide ask "Installing a dependency — confirm first (supply-chain check). Plain reinstalls (no package name) aren't affected."
fi

exit 0
