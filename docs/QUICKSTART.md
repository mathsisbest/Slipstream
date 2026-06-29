# Quickstart

Goal: from a fresh clone to your first reviewed PR in about ten minutes, with the gate visible the whole way.

## 1. Check your environment

```bash
bin/slipstream doctor
```

It verifies `git`, a runtime CLI (`claude` or `codex`), and `node`, and warns if `ANTHROPIC_API_KEY` is set (which would bill you instead of using your subscription). Fix anything it flags before continuing.

## 2. Drop the config into your project

Run the installer from this repo:

```bash
bin/slipstream init /path/to/your/project --stack node --with-claude-hooks
```

Use `--stack python` or `--stack flutter` for those project types. Omit `--with-claude-hooks` if you are not using Claude Code hooks; Codex users still get the shared `AGENTS.md`, gate, CI, templates, and review loop.

The installer will not overwrite existing files unless you pass `--force`.

## 3. Adapt and run the gate

In your project, edit `AGENTS.md` so the project description and commands are exact. Then run:

```bash
cd /path/to/your/project
make ci
```

The gate is the thing that stops a broken change from reaching your branch, so get it running before you let an agent build.

Then audit the repo:

```bash
bin/slipstream check /path/to/your/project
```

## 4. Make a change the right way

In your project, ask the agent to do one scoped thing and to follow the loop:

```
Plan first: list the files you'll touch and the approach. Don't edit yet.
```

Review the plan. If it's wrong, the cheapest place to fix it is here, before any code exists. Then:

```
Implement it. Run the gate. Open a PR with the gate output in the body. Don't merge.
```

## 5. Review it with fresh eyes

The installer copied `REVIEW_GUIDE.md`. Open a separate session (a clean context, no memory of building it) and run the review checklist:

```
Review this PR against REVIEW_GUIDE.md. Be skeptical. Report findings.
```

A reviewer that just watched itself build the thing rubber-stamps it. A fresh one catches more.

## 6. Merge

If the gate is green and the review is clean, you merge. That's the only step the kit will never do for you.

## Next

- Run a whole feature as a fleet: [PROJECT_BUILDER.md](PROJECT_BUILDER.md).
- Use the CLI control plane: [CLI.md](CLI.md).
- Let an agent work the backlog overnight: [../workflows/overnight-routine.md](../workflows/overnight-routine.md).
- Understand the tradeoffs before you scale up: [PLAYBOOK.md](PLAYBOOK.md) and [ECONOMICS.md](ECONOMICS.md).
