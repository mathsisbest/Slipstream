# Agent cheat-sheet

> The rules live in `AGENTS.md` and load automatically. Don't re-explain them. Just say role plus outcome.

## Say this

| Intent | Say this | What you get |
|---|---|---|
| Plan / decompose | `Plan only: numbered list of independent tasks + the files each touches. No code.` | A scoped task list, no edits |
| Find / locate | `Just find where X is / how X works. Don't change anything.` | A read-only trace |
| Build one thing | `Implement <thing>. Gate it, open a PR, don't merge.` | A PR ready for review |
| Review | `Review #<n> against docs/REVIEW_GUIDE.md. Be skeptical.` | Findings and a verdict |
| Fan out reads | `Spawn parallel subagents to research A, B, C and summarise.` | Parallel read-only reports |
| Parallel edits | `Spawn N teammates for tasks 1–N; each owns its files, gates, opens its own PR.` | Independent PRs |
| Overnight | Create a scheduled routine; paste `workflows/overnight-routine.md` | A scheduled run |
| Hard problem | Add `think hard` to the prompt | Extended reasoning |

## Roles

| Role | Does | Trigger |
|---|---|---|
| Planner | Decomposes, writes no code | `Plan only…` |
| Explorer | Read-only research | `Just find…` |
| Builder | Implements, gates, opens a PR | `Implement…` |
| Reviewer | Adversarial review, no commits | `Review #<n>…` |
| Subagent | One scoped task, reports back | `Spawn a subagent to…` |
| Teammate | Parallel peer, owns its files | `Spawn N teammates…` |

## The four things to add when going parallel

1. **Independent** — tasks share no files and no ordering dependency.
2. **Ownership** — name who owns what ("agent 1 owns X, agent 2 owns Y").
3. **Gate first** — "gate it and show evidence before the PR".
4. **Model** — name a tier if it matters; omit to let it decide.
