# Claude Code In-Loop Hooks

Deterministic guardrails that fire *inside* the Claude Code agent loop, before a change lands. Your git pre-commit hooks only catch things at commit time; these catch them at the moment the agent acts. They make the kit's rules (no secrets, no protected-path writes, clean formatting) enforced by code rather than by hoping the agent read its instructions.

These hooks are Claude Code-specific because they install through `.claude/settings.json`. Codex users still use Slipstream's shared `AGENTS.md`, Makefile gate, GitHub CI, PR template, and fresh-context review loop; do not assume these hook scripts run inside Codex unless your Codex environment has an equivalent hook mechanism wired in.

## What's here

| Hook | Event | What it does |
|---|---|---|
| `guard-write.sh` | PreToolUse (Write/Edit) | Denies writes to env files (`.env*`, `.envrc`), `auth/`, `migrations/`, and private-key paths (`.pem`, `.key`, `id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa`); denies content matching known secret/token formats |
| `guard-bash.sh` | PreToolUse (Bash) | **Denies** the catastrophic/irreversible (recursive-force `rm` of `/`, `~`, `$HOME`, `..`, a bare `*`, or a system dir; `mkfs`; `dd if=`; a fetch piped into a shell). **Asks** about the recoverable-but-risky (recursive `rm` of a specific path like `/tmp/x` or `./dist`, a local `… \| bash`, or a new dependency install). Ordinary in-project cleanup (`rm -rf node_modules`) is allowed |
| `format-on-save.sh` | PostToolUse (Write/Edit) | Formats the touched file with your stack's formatter, if installed |
| `notify-stop.sh` | Stop | Desktop notification when the agent finishes a turn (macOS) |

These guards are **best-effort pattern matches, not a sandbox.** They stop the common accidents an agent is likely to emit; they do not catch every variant (e.g. unusual flag spellings, base64-obfuscated secrets, novel token formats). Treat them as one layer of defense-in-depth alongside your commit hooks and review — not a hard guarantee. See the comments in each script for exactly what's covered.

## Install

The easiest path is the Slipstream installer:

```bash
bin/slipstream init /path/to/your/project --stack node --with-claude-hooks
```

For manual install, merge `settings.fragment.json` into your project's `.claude/settings.json` (under the `hooks` key), then make the scripts executable:

```bash
mkdir -p .claude
# merge the "hooks" block from hooks/settings.fragment.json into .claude/settings.json
chmod +x hooks/*.sh
```

`$CLAUDE_PROJECT_DIR` resolves to your project root. If your setup doesn't expand it, use absolute paths in the fragment. The scripts need `jq`.

## Tests

`hooks/tests/guards.test.sh` pipes sample tool payloads into the guards and asserts the decision (`allow` / `ask` / `deny`). Run it after editing a regex — it catches both new bypasses and over-broad false-positives:

```bash
bash hooks/tests/guards.test.sh
```

You can spot-check a single case the same way the hook is invoked:

```bash
printf '{"tool_input":{"command":"rm -fr /"}}' | bash hooks/guard-bash.sh
```

## Design decisions (why these and not others)

- **Blocking uses the JSON `permissionDecision: "deny"` mechanism, not `exit 2`.** There's a known case where `exit 2` does not reliably block Write/Edit. The JSON decision path blocks them reliably.
- **The formatter is recursion-safe.** It runs the formatter binary directly on the file; it never calls the Write/Edit tool, so it can't trigger its own PostToolUse. There's also a `SLIPSTREAM_FMT` marker as a second guard. (Formatter infinite-loops are a documented failure mode; this avoids both causes.)
- **No LLM-classifier hook.** A "semantic" hook that calls a model on every tool use would burn your subscription quota for marginal value. Everything here is plain shell. Intentional.
- **`guard-bash.sh` uses `ask`, not `deny`, for dependency installs** so you stay in control without blocking legitimate work. Plain reinstalls (no package name) aren't touched.

## Optional: type-check pipe-back

You can extend `format-on-save.sh` to run a type-checker on the touched file and feed errors back to the agent (PostToolUse `exit 2` shows stderr to the model). Keep it **stack-conditional** — only run when the checker is installed:

```bash
# in format-on-save.sh, for *.ts|*.tsx, after formatting:
if command -v tsc >/dev/null 2>&1; then
  errs=$(tsc --noEmit -p tsconfig.json 2>&1) || { echo "$errs" >&2; exit 2; }
fi
```

**Don't run `tsc --noEmit "$fp"` on a single file in a real project.** Checking one file in isolation drops the project's `tsconfig.json` (paths, lib, types, module resolution), so it reports spurious errors for anything that imports from elsewhere. Single-file mode only works for self-contained files with no project imports. For everything else, type-check the project (`tsc --noEmit -p tsconfig.json`, or your `npm run typecheck`) — slower, but the errors are real.

Left out of the default because it slows the loop and only some projects want it.
