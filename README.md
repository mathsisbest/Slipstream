# Slipstream

**A high-velocity starter kit for Claude Code and Codex.**

Slipstream is a set of configs, workflows, and gates you drop into a repo so your coding agents plan before they build, work in isolation, prove themselves before opening a PR, and get reviewed before anything merges. It is the working setup of someone who runs a fleet of agents, packaged so you inherit it on day one instead of assembling it over six months.

It runs inside the Claude Code or Codex you already have. No app to install, no API key, no metered cost. It rides on your existing subscription.

> **Open source.** Slipstream is available under the MIT License. Use it, adapt it, and ship with it. See [LICENSE](LICENSE).

## Why it exists

Agents write code fast and judge their own work poorly. Left alone they produce confident, plausible changes that quietly break things. Slipstream wraps them in a workflow that makes a change earn its way to your main branch: a frozen plan, isolated work, a gate it cannot skip, and a review it did not write itself.

## The loop

```
describe  →  plan  →  build (isolated)  →  gate  →  review  →  you merge
```

You describe what you want. An agent grounds itself and writes a plan you approve before it touches code. Work happens in a git worktree so parallel agents never collide. Each change runs your gate (lint, types, tests) before it becomes a PR. A fresh agent reviews the diff it didn't write. You merge. Nothing merges itself.

## Quickstart

```bash
git clone https://github.com/mathsisbest/Slipstream.git
cd Slipstream
bin/doctor.sh          # checks git, claude/codex, node; flags the metered-billing trap
bin/slipstream doctor  # richer CLI doctor
bin/slipstream init /path/to/your/project --stack node --with-claude-hooks
bin/slipstream check /path/to/your/project
bin/slipstream dashboard --repo /path/to/your/project
```

Use `--stack python` or `--stack flutter` for those project types. Omit `--with-claude-hooks` if you are not using Claude Code hooks. Full walkthrough, including your first reviewed PR in about ten minutes: [docs/QUICKSTART.md](docs/QUICKSTART.md).

## What's in the kit

| Area | File(s) | What it does |
|---|---|---|
| **Installer** | [bin/slipstream](bin/slipstream) | Scaffolds AGENTS/CLAUDE config, Makefile gate, GitHub CI, PR/issue templates, review guide, and optional Claude Code hooks into a target repo |
| **CLI control plane** | [bin/slipstream](bin/slipstream), [docs/CLI.md](docs/CLI.md) | `doctor`, `init`, `check`, `plan`, `run`, `status`, and `dashboard` commands for operating the workflow |
| **Local dashboard** | [docs/DASHBOARD.md](docs/DASHBOARD.md) | Browser view of repo readiness, Slipstream runs, branches, and open PRs |
| **Agent config** | [AGENTS.md](AGENTS.md), [templates/CLAUDE.md](templates/CLAUDE.md) | One canonical instruction file with velocity defaults and `Always / Ask First / Never` boundaries; a thin `CLAUDE.md` that imports it |
| **Fleet orchestrator** | [workflows/project-builder.js](workflows/project-builder.js), [docs/PROJECT_BUILDER.md](docs/PROJECT_BUILDER.md) | Contract-first plan, file-disjoint build waves in worktrees, a self-gate, an adversarial review panel, then PRs. Plan-only by default |
| **Quality gates** | [gates/](gates/) | A `ci.yml` and `Makefile` template per stack; a fast pre-PR gate and a full gate |
| **Claude Code hooks** | [hooks/](hooks/) | Optional in-loop guards for Claude Code. Codex still uses the shared AGENTS instructions, gate, CI, and review loop |
| **Review** | [docs/REVIEW_GUIDE.md](docs/REVIEW_GUIDE.md) | A skeptical, fresh-context review checklist the reviewer runs against a diff it didn't write |
| **Overnight loop** | [workflows/overnight-routine.md](workflows/overnight-routine.md) | A scheduled agent that picks one backlog issue, builds it, gates it, opens a PR, and stops |
| **GitHub scaffolding** | [.github/](.github/) | PR template and issue templates (epic / slice / bug) |
| **Memory** | [MEMORY.md](MEMORY.md), [memory/TEMPLATE.md](memory/TEMPLATE.md) | A persistent-fact pattern so corrections stick instead of resetting each session |
| **Playbook** | [docs/PLAYBOOK.md](docs/PLAYBOOK.md), [docs/AGENT-CHEATSHEET.md](docs/AGENT-CHEATSHEET.md) | How to decompose, when to go parallel, model tiering, and the honest economics |

## How fast is "high velocity"

Fast enough that decomposition and review become your bottleneck, not typing. The kit is built around that truth. The orchestrator runs build waves of around ten agents because the harness caps concurrency near sixteen and a subscription rate-limits you. "Hundreds of agents" means hundreds across the waves of a day, not at once. The gate and your review are the real constraint, and the kit is designed to keep both honest rather than to spawn more agents.

## What it doesn't do

It won't merge for you. It won't write the hard last twenty percent (real edge cases, security hardening, performance work) where agent throughput collapses. Use it to get a scoped feature or an MVP to a reviewed PR quickly, then harden by hand. It assumes you review what you merge.

## Economics

Driving the `claude` or `codex` CLI uses your subscription, not a metered API. The one trap: if `ANTHROPIC_API_KEY` is set in your environment, Claude Code uses it and bills you. The doctor script checks for this. Full detail in [docs/ECONOMICS.md](docs/ECONOMICS.md).

## Credits

The gate, worktree, overnight-loop, and single-liaison-with-a-visible-fleet patterns draw on the open-source agentic tools by [Kun Cheng (`kunchenguid`)](https://github.com/kunchenguid): `treehouse`, `gnhf`, `no-mistakes`, and `firstmate`. Slipstream adapts those ideas into a config-and-workflow kit that works across runtimes.
