# 🪔 Lighthouse

**A drop-in starter kit that makes Claude Code and Codex work at high velocity from day one.**

Lighthouse isn't an app you install — it's a set of configs, workflows, gates, and playbooks you drop into any project so your agents plan before they build, build in isolation, prove themselves before a PR, and get adversarially reviewed before anything merges. The methodology of a principal engineer running a fleet, packaged so a newcomer inherits it on day one.

> Runs *inside* the Claude Code / Codex you already use. No new app, no API key, no metered cost — it rides entirely on your own subscription-authenticated CLI.

---

## Status

> ⚠️ **Public source, not open source.** This repository is made publicly visible for reference and transparency. It is **proprietary — all rights reserved** (see [LICENSE](LICENSE)). You may read it; you may not copy, modify, redistribute, or use it without written permission.

Early scaffold. The feature set below is the build plan; each lands as its own reviewed PR.

---

## What's in the kit

### 1. Agent configuration — *the brain*
- Runtime-agnostic **`AGENTS.md`** (canonical) + a thin **`CLAUDE.md`** `@import` wrapper — one source of truth, works for both Claude Code and Codex.
- Velocity defaults baked in: **model tiering** (Haiku for reads · Sonnet for building · Opus for genuine reasoning), **decomposition before parallelism**, **self-gate before every PR**, **worktree isolation**.
- Kept under ~200 lines with modular `@import`s to dodge context rot.

### 2. The fleet orchestrator — *the engine*
- **`project-builder`** workflow: contract-first plan → dependency-ordered waves of **file-disjoint** builders, each in its own git worktree → self-gate → **adversarial multi-lens review panel** → human merge. Nothing auto-merges.
- Knobs: `planDepth` (one architect vs a ~15-agent deep planner), `reviewDepth` (light / standard / full), **plan-only safe default**.
- Two modes, auto-detected: **flat** (a PR per task) and **integration** (dependency chains → one final PR).

### 3. Quality gates — *the no-mistakes layer*
- `make ci` / `make ci-lite` **gate templates** per stack (Node · Python · Flutter) — fast pre-PR gate vs full gate.
- Pre-commit / pre-push **hooks**: secret redaction, commit-identity enforcement, block-direct-to-main.
- Self-verify-before-PR discipline with the gate evidence pasted into the PR body.

### 4. Adversarial review — *the panel*
- **`/review-pr`** command: skeptical, multi-lens review (correctness · security · contract · **honesty**).
- **Fresh-context reviewer** discipline — the reviewer is never the implementer, and runs in its own worktree (no collusive self-validation).
- A reusable `REVIEW_GUIDE` checklist + hard-constraint guardrails.

### 5. Continuous & overnight loops — *always-on*
- An **overnight Routine** prompt: fresh context per iteration, a rolling `notes.md` journal the next run reads, natural-language "stop-when", automatic rollback on failure.
- A mandatory **safety envelope**: max-iterations, per-run cost ceiling, an always-visible kill switch, dry-run by default.

### 6. GitHub scaffolding — *the delivery rails*
- Reusable **`ci.yml`** (docs path-ignore · draft-skip · concurrency-cancel).
- **PR template** + **issue templates** (epic / slice / bug).
- A branch-and-PR workflow designed for GUI-first review.

### 7. Memory discipline — *persistent context*
- A `MEMORY.md` index + per-fact memory-file pattern (user · feedback · project · reference).
- **Failure-to-memory** capture: turn a correction into a durable rule instead of a silent hand-patch.

### 8. The playbook — *the teaching layer*
- **Velocity playbook**: the walls of parallelism, the model-tiering table, the mechanism-picker (subagents · agent teams · parallel sessions · routines · actions).
- **Agent cheat-sheet**: copy-paste trigger phrases, a roles table, the four rules for going parallel.
- **Honest-economics guide**: subscription quota vs metered API, the ~16-concurrent cap, the `ANTHROPIC_API_KEY` billing gotcha.

### 9. Quickstart + doctor — *day one*
- A `doctor` script: checks `git` / `claude` / `codex` / `node` and flags the metered-billing gotcha.
- A **"10-minute first reviewed PR"** quickstart that walks a newcomer from clone → fleet build → merged PR.

---

## Roadmap

Lighthouse's north star is a GUI layer on top of this kit — a watchable **merge gate**, a fleet board, and first-class continuous loops, **runtime-neutral across Claude Code and Codex**. The kit ships the methodology first; the visual layer comes once the methodology is proven. (Detailed product vision kept internally.)

---

## Credits

The gate / worktree-pool / overnight-loop / liaison-fleet patterns draw on the open-source agentic toolkit by **[Kun Cheng (`kunchenguid`)](https://github.com/kunchenguid)** — `treehouse`, `gnhf`, `no-mistakes`, `firstmate`. Lighthouse packages these ideas as a GUI-first, runtime-agnostic kit.
