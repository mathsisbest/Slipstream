#!/usr/bin/env bash
# PreToolUse (Bash): deny the irreversible, ask about the risky-but-recoverable, allow the rest.
#
# These are best-effort pattern guards, not a sandbox. A determined command can slip through;
# the point is to stop the common accidents an agent emits, without walling off routine work.
# `deny` is terminal (the agent can't proceed), so it's reserved for the genuinely catastrophic.
# Everything else risky becomes `ask` (one confirm), and ordinary cleanup is allowed silently.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# A recursive-AND-force rm, in any flag order/spelling (-rf, -fr, -r -f, -rfv, ...). The leading
# boundary keeps it from firing inside words like "confirm".
rm_rf_flags='(^|[^[:alnum:]_])rm[[:space:]]+.*(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR]|-[rR][[:space:]]+-[a-zA-Z]*f|-f[[:space:]]+-[a-zA-Z]*[rR])'

# Catastrophic targets: near-irreversible and almost never intended — bare / ~ $HOME . .. *,
# the cwd/root/home as a glob, and system directories. A recursive-force rm at one of these = deny.
rm_catastrophic='[[:space:]](/\*|~/\*|\./\*|\.\.|\$HOME|\./|/|~|\*|\.)([[:space:]]|[;&|]|$)|[[:space:]]/(usr|etc|var|bin|sbin|lib|opt|boot|dev|sys|proc|System|Library)([[:space:]]|[;&|]|$)'

# A recursive-force rm aimed at a SPECIFIC location (absolute path, ./ , ../ , ~/ , $HOME/) is
# recoverable-ish but worth a confirm. A bare in-project name (node_modules, dist, build/cache)
# is ordinary cleanup and isn't matched here — it's allowed.
rm_ask_path='[[:space:]](/|\./|\.\./|~/|\$HOME/)'

# Other irreversible disk operations.
destructive='mkfs|dd[[:space:]]+if='

# Remote-exec: a fetch (curl/wget/fetch) piped — through any intermediate stages — into an
# interpreter, OR a shell reading a fetched script via process substitution, OR a fetch into a
# base64 decode (the usual obfuscation step). This is the classic malware shape → deny.
net_fetch_shell='(curl|wget|fetch)[^|]*\|([^|]*\|)*[[:space:]]*(sudo[[:space:]]+)?((/usr)?/bin/)?(sh|bash|zsh|dash|ksh|python3?|perl|ruby|node)([[:space:]]|[<;&|]|$)|(sh|bash|zsh|dash|ksh)[[:space:]]+<\([^)]*(curl|wget|fetch)|(curl|wget|fetch)[^|]*\|.*base64[[:space:]]+-d'

# A purely local pipe-into-a-shell (cat file | bash) or shell process substitution (bash <(...))
# is sometimes legitimate (running a generated script) → ask, not deny.
local_pipe_shell='\|[[:space:]]*(sudo[[:space:]]+)?((/usr)?/bin/)?(sh|bash|zsh|dash|ksh)([[:space:]]|[<;&]|$)|(sh|bash|zsh|dash|ksh)[[:space:]]+<\('

# ---- DENY: irreversible or remote-exec ----
if printf '%s' "$cmd" | grep -Eq "$destructive|$net_fetch_shell"; then
  decide deny "Blocked: destructive or remote-exec command (disk wipe, or fetch piped into a shell). If this is truly intended, run it yourself."
fi
if printf '%s' "$cmd" | grep -Eq "$rm_rf_flags" && printf '%s' "$cmd" | grep -Eq "$rm_catastrophic"; then
  decide deny "Blocked: 'rm -rf' aimed at a catastrophic target (/, ~, \$HOME, .., a bare *, or a system dir). If you really mean it, run it yourself."
fi

# ---- ASK: recoverable but worth a confirm ----
if printf '%s' "$cmd" | grep -Eq "$rm_rf_flags" && printf '%s' "$cmd" | grep -Eq "$rm_ask_path"; then
  decide ask "Recursive force-delete of a specific path — confirm the target before it runs."
fi
if printf '%s' "$cmd" | grep -Eq "$local_pipe_shell"; then
  decide ask "Piping into a shell — confirm before running (it's occasionally legit, e.g. a generated script)."
fi

# New dependency install → escalate to the human (supply-chain check). Match the verb regardless
# of flags, but require a real package argument so plain reinstalls (npm install, npm ci) pass.
dep_verb='(npm|pnpm|yarn)[[:space:]]+(install|i|add)|pip3?[[:space:]]+install|cargo[[:space:]]+add|go[[:space:]]+get|brew[[:space:]]+install'
dep_pkg='[[:space:]]+(-[^[:space:]]*[[:space:]]+)*[^-[:space:]]'
if printf '%s' "$cmd" | grep -Eq "($dep_verb)$dep_pkg"; then
  decide ask "Installing a dependency — confirm first (supply-chain check). Plain reinstalls (no package name) aren't affected."
fi

exit 0
