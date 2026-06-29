# Project Builder

`workflows/project-builder.js` is the fleet orchestrator. It asks an architect agent to lock contracts and produce a dependency-ordered task graph, then dispatches builder agents in file-disjoint waves, gates their work, reviews each diff through adversarial lenses, and opens PRs for human review.

It is **plan-only by default**. Execute mode must be explicit.

## Requirements

- A git repo with a remote named `origin`.
- A real gate command, usually `make ci`.
- `gh` authenticated if execute mode will open PRs.
- Branch pushes allowed for the selected runtime.
- A unique `runStamp` for every execute run.

## Plan-Only

Use this first. It reads the repo and returns contracts plus a waved task graph, but writes nothing:

```json
{
  "goal": "Add audit logging to user settings changes",
  "repoPath": "/path/to/project",
  "stack": "node",
  "gateCmd": "make ci"
}
```

Review the returned contracts, files, dependencies, and `graphIssues`. If the files overlap in a wave or the scope is too broad, rerun plan-only with a tighter goal.

## Execute

Execute mode opens branches and PRs. `runStamp` is required so branch and worktree names are unique:

```json
{
  "goal": "Add audit logging to user settings changes",
  "repoPath": "/path/to/project",
  "stack": "node",
  "gateCmd": "make ci",
  "execute": true,
  "runStamp": "20260628-1430"
}
```

For multi-wave plans, the workflow creates an integration branch named `pb/<runStamp>` and builder branches under `pb/<runStamp>/builder/<task>`. It no longer force-pushes the integration branch; if the branch already exists, the run should stop rather than overwrite another run.

## Useful Args

| Arg | Default | Use |
|---|---:|---|
| `goal` | required | Plain-English description of the feature or project slice |
| `repoPath` | `.` | Target repository path |
| `gateCmd` | `make ci` | Full proof command |
| `liteGateCmd` | none | Faster gate for tasks that do not touch configured pipeline paths |
| `pipelinePatterns` | built-in list | Paths that force the full gate when `liteGateCmd` is set |
| `stack` | `(stack unspecified)` | Context for the architect |
| `baseBranch` | `main` | PR target and integration base |
| `maxWaveWidth` | `10` | Maximum independent tasks per wave |
| `execute` | `false` | Must be `true` to write branches or open PRs |
| `runStamp` | required in execute | Unique run id for branch/worktree names |
| `reviewDepth` | `standard` | `light`, `standard`, or `full` |
| `planDepth` | normal | Set to `deep` for larger or ambiguous builds |
| `commitIdentity` | git config | Optional explicit commit author |

## Operating Notes

- Keep goals small enough that the architect can assign clear file ownership.
- Treat `graphIssues` as blockers before execute.
- Use `reviewDepth: "full"` for public APIs, schema changes, auth, payments, or core behavior.
- If a task fails its gate or review, dependents are skipped rather than built on bad work.
- The workflow never merges to the base branch. A human still owns the final merge.
