# Slipstream CLI

`bin/slipstream` is the local control plane. It has no npm install step and uses only Node's standard library plus common command-line tools.

## Commands

```bash
bin/slipstream doctor [--repo PATH] [--json]
bin/slipstream init PATH --stack node|python|flutter [--with-claude-hooks] [--force]
bin/slipstream check [PATH] [--json] [--run-gate] [--expect-hooks]
bin/slipstream plan --repo PATH --goal TEXT [--run-stamp ID] [--workflow-command CMD|--runtime codex]
bin/slipstream run --repo PATH --run-stamp ID --execute [--workflow-command CMD|--runtime codex]
bin/slipstream status [PATH] [--json]
```

## What Each Command Does

| Command | Purpose |
|---|---|
| `doctor` | Checks local prerequisites: git, node, jq, Claude/Codex CLI, GitHub CLI auth, API-key billing traps, and git repo context. |
| `init` | Installs Slipstream into a repo: `AGENTS.md`, `CLAUDE.md`, `Makefile`, GitHub CI, PR/issue templates, review guide, `.gitignore` defaults, and optional Claude Code hooks. |
| `check` | Audits whether a repo is wired for production agent work. Use `--run-gate` to run `make ci`; use `--expect-hooks` if Claude Code hooks should be installed. |
| `plan` | Creates a `.slipstream/runs/<runStamp>/run.json` record with project-builder plan-only args. With `--runtime codex`, it asks Codex for a real plan in read-only mode. With `--workflow-command`, it sends args to your adapter on stdin and in `SLIPSTREAM_ARGS_JSON`. |
| `run` | Executes a saved plan only when `--execute` is present. With `--runtime codex`, it runs Codex in workspace-write mode. With no runtime or workflow command, it records `needs-workflow-command` instead of pretending work ran. |
| `status` | Shows repo readiness, git state, Slipstream run records, `pb/` branches, and open PRs when `gh` is available. |

## Built-In Codex Runtime

If Codex is installed, you can use:

```bash
bin/slipstream plan \
  --repo /path/to/project \
  --goal "Add audit logging" \
  --run-stamp 20260628-1430 \
  --runtime codex

bin/slipstream run \
  --repo /path/to/project \
  --run-stamp 20260628-1430 \
  --execute \
  --runtime codex
```

The plan step uses Codex read-only mode. The run step uses Codex workspace-write mode and still follows the normal rule: it must gate, must not merge, and should leave a PR or clear branch summary.

## Workflow Adapter Contract

For full project-builder or another runtime, pass an adapter command:

```bash
bin/slipstream plan \
  --repo /path/to/project \
  --goal "Add audit logging" \
  --run-stamp 20260628-1430 \
  --workflow-command "./scripts/run-project-builder"
```

The adapter receives the JSON args in two places:

- stdin
- `SLIPSTREAM_ARGS_JSON`

This keeps Slipstream portable across Claude Code, Codex, and other workflow runners. If no adapter or runtime is supplied, the run state is still saved and visible in `status`.

## Local State

Run records live under:

```text
.slipstream/runs/<runStamp>/run.json
```

`init` adds `.slipstream/` to `.gitignore` because this is local operating state, not source code.
