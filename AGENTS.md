# Agent Guide

> This is the canonical instruction file for agents working in this repo. Keep it under ~200 lines. `CLAUDE.md` imports it so Claude Code picks up these rules; Codex reads `AGENTS.md` directly. Both get the same rules.

## Project

Slipstream is a high-velocity agent workflow starter kit: docs, shell hooks, GitHub templates, and a JavaScript workflow script for coordinating coding agents.

- **Build:** `make ci`
- **Test:** `bash hooks/tests/guards.test.sh`
- **Gate (run before every PR):** `make ci`
- **Run locally:** `bin/doctor.sh`

## How to work here

- **Plan before you build.** For anything non-trivial, write the plan first (files you'll touch, the approach) and get it confirmed before editing.
- **One concern per change.** A PR does one thing. If you find a second thing worth fixing, note it; don't fold it in.
- **Gate yourself before opening a PR.** Run the gate command above. Paste the result in the PR. A green build that never exercised the changed path is not a gate.
- **Match the surrounding code.** Follow the conventions already in the file you're editing. Don't reformat or refactor code you weren't asked to touch.
- **Isolate parallel work.** When several tasks run at once, each works in its own `git worktree` and owns a disjoint set of files.

## Model tiering

- **Haiku** for pure read/search fan-out.
- **Sonnet** for implementation and standard changes. This is the default.
- **Opus** only for genuine multi-step reasoning: ambiguous design, hard debugging.
- Reserve max-effort multi-agent runs for genuinely hard problems, not routine edits.

## Boundaries

**Always (do without asking):**
- Read any file, run the gate, run tests, search the codebase.
- Make the smallest change that satisfies the task.
- Fix a failing gate by addressing the root cause.

**Ask first (stop and check):**
- Changing a public API, a data schema, or a migration.
- Adding a dependency.
- Deleting or rewriting a file you didn't create.
- Anything that touches auth, secrets, billing, or production config.

**Never:**
- Merge your own work, or push to the default branch directly.
- Commit secrets, tokens, or `.env` contents. Keys live in the environment or a keychain, never in code, logs, or config.
- Suppress or skip a failing test to make the gate pass.
- Weaken the gate to get a change through.

## What NOT to put in this file

Empirically, these add tokens and cost without helping an agent (they find files on their own):

- Directory trees or file listings.
- Auto-generated summaries of the codebase.
- Standard conventions the language or framework already implies.

Add a rule only when you've seen the mistake happen, and ideally only on the second occurrence. Keep the signal high.
