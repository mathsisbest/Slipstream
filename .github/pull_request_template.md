<!-- One concern per PR. Conventional title: type(scope): summary -->

## Summary
<!-- 2–4 sentences: what changed and why -->

## Changes
<!-- bullet list of files/functions touched -->

## Risk
<!-- what could this break? blast radius? anything irreversible? -->

## Verification
Gate command: `<make ci / npm test / pytest / …>`
Result: PASSED / FAILED

<details><summary>Gate output</summary>

```
<paste the gate output here>
```

</details>

## For the reviewer
- [ ] Single concern, no unrelated changes
- [ ] Logic correct, edge cases handled
- [ ] No secrets in code, logs, or config
- [ ] Tests prove behavior (not hard-coded to pass)
- [ ] Gate is green and the output above is real

## Questions
<!-- anything you're unsure about, or decisions the reviewer should weigh in on -->
