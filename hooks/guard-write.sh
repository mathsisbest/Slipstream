#!/usr/bin/env bash
# PreToolUse (Write|Edit): deny writes to protected paths or content that looks like a secret.
# Uses the JSON permissionDecision mechanism (reliable for Write/Edit) rather than exit 2.
set -euo pipefail

input=$(cat)
fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
content=$(printf '%s' "$input" | jq -r '[.tool_input.content?, .tool_input.file_text?, .tool_input.new_string?] | map(select(. != null)) | join("\n")')

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Protected paths: secrets, auth, migrations, private keys.
if printf '%s' "$fp" | grep -Eq '(^|/)\.env(\.|$)|/auth/|/migrations/|\.pem$|(^|/)id_rsa'; then
  deny "Refusing to write '$fp' — protected path (.env / auth / migrations / private key). A human should make this change."
fi

# Obvious secret material in the content being written.
if printf '%s' "$content" | grep -Eq 'sk-ant-[A-Za-z0-9_-]{20}|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|-----BEGIN[A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30}'; then
  deny "Refusing to write '$fp' — content looks like it contains a secret or API key. Keep secrets in the environment, never in tracked files."
fi

exit 0   # no decision: let it proceed
