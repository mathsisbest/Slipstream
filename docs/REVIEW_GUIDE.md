# Review guide

For the reviewer. Run this against a diff you did **not** write, in a fresh session. Your job is to find what's wrong, not to confirm it looks fine.

## Before you start

- Read the diff and the files it touches, not just the PR description.
- Read the linked plan or issue. The change should do what was agreed and nothing more.
- Assume the gate can be gamed. A green check is necessary, not sufficient.

## What to check

**Correctness**
- Logic errors, off-by-one, wrong assumptions, unhandled edge cases.
- Error handling: are failures swallowed? Are resources released?
- Does the changed path actually run? For UI, was it rendered and looked at, or just compiled?

**Reward hacking (the gate-gaming checks)**
- Are tests hard-coded to the expected output, or do they test behavior?
- Were tests weakened, skipped, or deleted to get green?
- Was the harness or config edited to pass rather than the code fixed?
- Does the change quietly special-case the test inputs?

**Security**
- Any secret, token, key, or `.env` value in code, logs, or config? That's a blocker.
- Untrusted input reaching a shell, query, or file path without validation.
- New dependency: is it real, maintained, and not typosquatted?

**Scope and contract**
- Does it match the frozen plan or API contract verbatim?
- Unrelated refactors, drive-by reformatting, or scope creep?
- Files touched that the task didn't call for.

**Honesty (for anything user-facing)**
- Does the UI claim something the data doesn't support? (e.g. labeling synthetic data as real, attributing a source it didn't come from.)
- Were captions, attributions, or status indicators actually verified against the rendered output?

## Verdict

End with one of:

- **APPROVE** — gate green, no real issues found. Say what you checked.
- **REQUEST CHANGES** — list each issue as `file:line — problem — suggested fix`, marked P1 (must fix) or P2 (should fix).
- **BLOCK** — a secret leak, a gamed gate, or a contract violation. State it plainly.

Take findings seriously and fix forward. A reviewer that never blocks isn't reviewing.
