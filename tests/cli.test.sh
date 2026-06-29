#!/usr/bin/env bash
# Smoke tests for the Slipstream CLI. No deps beyond bash, git, node, jq, and curl.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cleanup() {
  if [ -n "${DASH_PID:-}" ]; then
    kill "$DASH_PID" >/dev/null 2>&1 || true
    wait "$DASH_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

pass=0
check() {
  local name=$1
  shift
  "$@"
  pass=$((pass+1))
  printf '  \033[32m✓\033[0m %s\n' "$name"
}

repo="$TMP/repo"
mkdir -p "$repo"
git -C "$repo" init -q
adapter="$TMP/adapter.sh"
cat >"$adapter" <<'ADAPTER'
#!/usr/bin/env bash
set -euo pipefail
test -n "${SLIPSTREAM_ARGS_JSON:-}"
jq -e '.execute == false' >/dev/null
ADAPTER
chmod +x "$adapter"

check "help" bash -c '"$1" --help >/dev/null' _ "$ROOT/bin/slipstream"
check "doctor json" bash -c '"$1" doctor --json | jq -e ".summary.pass >= 1" >/dev/null' _ "$ROOT/bin/slipstream"
check "init" bash -c '"$1" init "$2" --stack node --with-claude-hooks >/dev/null' _ "$ROOT/bin/slipstream" "$repo"
check "check json clean" bash -c '"$1" check "$2" --json --expect-hooks | jq -e ".ok == true and .summary.fail == 0" >/dev/null' _ "$ROOT/bin/slipstream" "$repo"
check "plan record" bash -c '"$1" plan --repo "$2" --goal "Add audit logging" --run-stamp cli-smoke --json | jq -e ".status == \"plan-ready\" and .projectBuilderArgs.execute == false" >/dev/null' _ "$ROOT/bin/slipstream" "$repo"
check "workflow adapter plan" bash -c '"$1" plan --repo "$2" --goal "Adapter plan" --run-stamp adapter-smoke --workflow-command "$3" --json | jq -e ".status == \"planned\" and .lastExit == 0" >/dev/null' _ "$ROOT/bin/slipstream" "$repo" "$adapter"
check "run requires adapter but records state" bash -c '"$1" run --repo "$2" --run-stamp cli-smoke --execute --json | jq -e ".status == \"needs-workflow-command\" and .projectBuilderArgs.execute == true" >/dev/null' _ "$ROOT/bin/slipstream" "$repo"
check "status json" bash -c '"$1" status "$2" --json | jq -e ".runs[0].runStamp == \"cli-smoke\"" >/dev/null' _ "$ROOT/bin/slipstream" "$repo"

"$ROOT/bin/slipstream" dashboard --repo "$repo" --port 7339 >"$TMP/dashboard.log" 2>&1 &
DASH_PID=$!
sleep 1
check "dashboard html" bash -c "curl -fsS http://127.0.0.1:7339/ | grep -q 'Slipstream Dashboard'"
check "dashboard api" bash -c 'curl -fsS "http://127.0.0.1:7339/api/status?repo=$1" | jq -e ".runs[0].status == \"needs-workflow-command\"" >/dev/null' _ "$repo"

printf '\033[32mAll %d CLI smoke checks passed.\033[0m\n' "$pass"
