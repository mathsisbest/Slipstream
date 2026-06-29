# Local Dashboard

The local dashboard is a browser view over one repo's Slipstream state. It does not require a hosted service or a database.

Start it with:

```bash
bin/slipstream dashboard --repo /path/to/project
```

Then open the printed URL, usually:

```text
http://127.0.0.1:7331/?repo=/path/to/project
```

## What It Shows

- Production readiness checks from `slipstream check`.
- Current git branch and whether the worktree is dirty.
- Slipstream run records from `.slipstream/runs`.
- Local and remote `pb/` branches created by project-builder runs.
- Open pull requests when `gh` is authenticated and the repo has a GitHub remote.

## API

The dashboard serves local JSON endpoints:

```text
GET /api/status?repo=/path/to/project
GET /api/doctor
```

These use the same code paths as `slipstream status --json` and `slipstream doctor --json`.

## Local vs Hosted

This is deliberately local-first. It uses your existing filesystem, git, and GitHub CLI auth. That keeps the trust boundary small: no repo contents, logs, or tokens leave your machine because of the dashboard itself.
