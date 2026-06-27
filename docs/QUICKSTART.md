# Quickstart

Goal: from a fresh clone to your first reviewed, merged PR in about ten minutes, with the gate visible the whole way.

## 1. Check your environment

```bash
bin/doctor.sh
```

It verifies `git`, a runtime CLI (`claude` or `codex`), and `node`, and warns if `ANTHROPIC_API_KEY` is set (which would bill you instead of using your subscription). Fix anything it flags before continuing.

## 2. Drop the config into your project

Copy the two config files into your repo and adapt the bracketed parts:

```bash
cp AGENTS.md /path/to/your/project/AGENTS.md
cp templates/CLAUDE.md /path/to/your/project/CLAUDE.md
```

Edit `AGENTS.md`: set the build, test, and gate commands, and trim anything that doesn't apply. Keep it under ~200 lines.

## 3. Add a gate

Pick the template for your stack and wire it in:

```bash
cp gates/ci.yml.template /path/to/your/project/.github/workflows/ci.yml
cp gates/Makefile.template /path/to/your/project/Makefile   # optional: gives you `make ci`
```

Open the files and follow the swap comments for Python or Flutter. The gate is the thing that stops a broken change from reaching your branch, so get it running before you let an agent build.

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

Open a separate session (a clean context, no memory of building it) and run the review checklist:

```
Review this PR against docs/REVIEW_GUIDE.md. Be skeptical. Report findings.
```

A reviewer that just watched itself build the thing rubber-stamps it. A fresh one catches more.

## 6. Merge

If the gate is green and the review is clean, you merge. That's the only step the kit will never do for you.

## Next

- Run a whole feature as a fleet: [../workflows/project-builder.js](../workflows/project-builder.js) (read its header, run plan-only first).
- Let an agent work the backlog overnight: [../workflows/overnight-routine.md](../workflows/overnight-routine.md).
- Understand the tradeoffs before you scale up: [PLAYBOOK.md](PLAYBOOK.md) and [ECONOMICS.md](ECONOMICS.md).
