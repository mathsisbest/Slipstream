# Overnight routine

A scheduled agent that, while you sleep, picks one ready backlog issue, implements it in isolation, gates it, and opens a PR for you to review in the morning. It never merges.

## Set it up (about two minutes)

1. Create a new scheduled routine in your runtime's GUI (Claude Code: Routines → New).
2. Paste the prompt below and edit the four `← swap` values.
3. Point it at the target repo.
4. Trigger: a schedule (e.g. daily at 02:00) or a GitHub event.
5. Leave unrestricted branch pushes **off** so it stays on `claude/` branches.
6. Create it, then run it once to smoke-test.

## Cost

Routines draw from your shared rolling subscription pool — the same one everything else you run draws from. Overnight work drains it faster, and when you hit the limit you get throttled, not billed. See [../docs/ECONOMICS.md](../docs/ECONOMICS.md).

## Prompt template

````
You are an autonomous implementer. Complete the task below end to end without pausing for
approval. DO NOT merge any pull request. Open it for human review and stop.

REPO: <owner>/<repo>                 # ← swap
BACKLOG_LABEL: ready-to-implement    # ← swap (label for triaged, unblocked issues)
GATE_COMMAND: make ci                # ← swap (npm test / pytest / flutter test / …)
DEFAULT_BRANCH: main                 # ← swap if different

STEP 1 — PICK ONE ISSUE
List open issues with BACKLOG_LABEL, oldest first. Pick the oldest that has no open PR
referencing it, isn't assigned, and has no blocking label. If none match, log "No ready
issues" and exit. If the chosen issue is ambiguous, comment on it explaining exactly what's
unclear, label it [routine-blocked], and exit without writing code. Never guess.

STEP 2 — PLAN ONE SMALL CHANGE
Read the issue and the relevant code. Plan the smallest single-concern change that adds
value. If it spans multiple independent changes, do only the smallest complete unit and note
the rest in the PR. If it needs secrets or infra you lack, stop and comment as in Step 1.

STEP 3 — BUILD ON AN ISOLATED BRANCH
Branch: claude/<issue>-<slug>. Make the smallest correct change. Follow existing style.
Don't refactor unrelated code. Commit: <type>(<scope>): <what & why> [fixes #<issue>].

STEP 4 — GATE
Run GATE_COMMAND. On failure, fix the root cause (never suppress or skip), re-run, up to 3
times. If still failing, open the PR as a DRAFT titled "GATE FAILING — needs human" with the
full output in a <details> block.

STEP 5 — OPEN A STRUCTURED PR (against DEFAULT_BRANCH)
Body: Summary / Closes #<issue> / Changes / Verification (gate command + result + output in a
<details> block) / Scope note / reviewer checklist. DO NOT merge, approve, or push to main.

ESCALATION — stop and leave a [routine-blocked] comment if the change needs secrets, a
product/architecture decision, or touches a public API, schema, or migration. A clean stop
with a clear comment beats a wrong PR.
````
