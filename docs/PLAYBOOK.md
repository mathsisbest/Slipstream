# Playbook

How to actually run agents at velocity without shipping a pile of plausible-looking bugs.

## 1. Worktrees fix one wall, not four

A git worktree prevents file-level collisions between parallel agents. That is all it does. Three other walls bite harder:

| Wall | Why it bites |
|---|---|
| **Decomposition** | If tasks overlap in scope, agents fight over the same logic no matter how isolated they are. Nothing else matters until this is solved. |
| **Integration** | N branches landing on main in quick succession create semantic conflicts git cannot auto-resolve. More agents means more collisions at merge time. |
| **Review capacity** | Agent diffs ship subtle bugs at a high rate. Auto-merging unread PRs ships the bugs with them. The gate is the bottleneck. |

You cannot buy your way past decomposition or review with more agents.

## 2. Slice first, spawn second

One agent equals one concern equals one file-ownership boundary.

- Run an architect pass first: one strong session reads the codebase and produces a numbered task list with explicit file ownership per task. No overlaps.
- Slice by module or directory ownership, not by feature. Two tasks that both touch `lib/auth/` are not independent.
- If a task needs two modules coordinated, it's one task for one agent.
- The task list is the real deliverable of planning. Spawn nothing until it exists.

## 3. Evidence before PR

Every agent gates itself before opening a PR. No exceptions.

```
lint → types → tests → (UI: render and look at it) → PR with the evidence pasted in
```

The PR body shows the commands run and their output. A passing build that never rendered the UI is not a gate. Gate failures block the PR; the agent gets one self-fix cycle, then flags for a human.

## 4. Model tiering

| Task | Tier |
|---|---|
| Renames, boilerplate, test stubs, read/search fan-out | Haiku |
| Implement a feature, write tests, standard refactor | Sonnet |
| Ambiguous design, hard debugging, cross-module coordination | Opus |
| Max-effort multi-agent orchestration | Reserve for genuinely hard problems |

Default to Sonnet until it fails twice. Haiku for fan-out reads. Opus when judgment is actually required.

## 5. Choosing the mechanism

| Mechanism | Best for | Rough limit |
|---|---|---|
| Subagents (fan-out reads) | Parallel research, grep/summarize | ~10–20; read-only |
| Coordinated agent team | Multi-file feature with a coordinator | 3–5; tight decomposition |
| Parallel sessions | Truly independent tasks | ~5–10 before review backs up |
| Overnight routine | Scheduled or long-running work | Unbounded, if your review pipeline is ready |
| CI / Actions | Deterministic post-PR gate | Keep agents out of CI logic |

## 6. Triage at scale

- Make lint/test/build required status checks. Nothing merges without green.
- Auto-merge-when-green only for mechanical PRs (dep bumps, generated code, pure refactors).
- A human reviews anything touching a public API, schema, auth, or core behavior.
- Self-label PRs at creation (`auto-merge-ok` vs `needs-human-review`).

## 7. The honest workflow for ~100 tasks

A hundred simultaneous agents is a queue size, not a goal.

```
1. Architect pass → numbered task list (one strong session)
2. Wave 1: 5–10 agents on fully independent leaf tasks
3. Gate fires → auto-merge green mechanicals, human reviews the rest
4. Wave 2: unblock tasks that depended on Wave 1
5. Repeat until the queue is empty
```

Ten well-scoped agents with a working gate outship a hundred poorly-scoped ones. If the review queue backs up, slow the spawning, not the standards.
