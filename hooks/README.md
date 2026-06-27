# In-loop hooks

Deterministic guardrails that fire *inside* the agent loop, before a change lands. Your git pre-commit hooks only catch things at commit time; these catch them at the moment the agent acts. They make the kit's rules (no secrets, no protected-path writes, clean formatting) enforced by code rather than by hoping the agent read its instructions.

## What's here

| Hook | Event | What it does |
|---|---|---|
| `guard-write.sh` | PreToolUse (Write/Edit) | Denies writes to `.env`, `auth/`, `migrations/`, private keys; denies content that looks like a secret/API key |
| `guard-bash.sh` | PreToolUse (Bash) | Denies destructive / pipe-to-shell commands; asks before installing a new dependency |
| `format-on-save.sh` | PostToolUse (Write/Edit) | Formats the touched file with your stack's formatter, if installed |
| `notify-stop.sh` | Stop | Desktop notification when the agent finishes a turn (macOS) |

## Install

Merge `settings.fragment.json` into your project's `.claude/settings.json` (under the `hooks` key), then make the scripts executable:

```bash
mkdir -p .claude
# merge the "hooks" block from hooks/settings.fragment.json into .claude/settings.json
chmod +x hooks/*.sh
```

`$CLAUDE_PROJECT_DIR` resolves to your project root. If your setup doesn't expand it, use absolute paths in the fragment. The scripts need `jq`.

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
  errs=$(tsc --noEmit "$fp" 2>&1) || { echo "$errs" >&2; exit 2; }
fi
```

Left out of the default because it slows the loop and only some projects want it.
