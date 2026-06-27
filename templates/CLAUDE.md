# Claude Code config

This file exists so Claude Code and Codex read the same rules. The canonical instructions live in `AGENTS.md`; this imports them and adds the few Claude-specific bits.

@../AGENTS.md

## When you compact this session

Compaction summarizes the conversation to free up context. When it happens, preserve verbatim:

- Every file path you've modified.
- The exact gate/test commands for this project.
- Any task still in progress and its next step.

Drop exploratory reasoning and tool output you no longer need. If you're close to the context limit mid-task, finish or checkpoint the current step before continuing rather than letting a summary eat the details you need to resume.

> Tip: `/compact preserve modified files and test commands` forces a focused compaction mid-session.
