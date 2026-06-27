# Flaky-test quarantine

A test suite with no flake handling teaches agents the wrong lesson. When a flaky test fails at random, the agent's cheapest move is to rerun until it goes green. That habit launders real failures through as "probably just flaky," and at high concurrency a 1%-flaky suite throws false reds constantly, burning quota on phantom work. Quarantine breaks the habit.

## The rule

1. **A quarantined test cannot satisfy the gate.** It runs, but its result is informational. It can't turn the gate green and it can't turn it red.
2. **One bounded retry, and it must classify.** On failure, a test may be retried at most once. If it passes on retry, mark it a *suspected flake* and quarantine it; do not silently move on. If it fails both times, it's a *real failure* and blocks. No retry-until-green.
3. **Quarantine is visible and temporary.** A quarantined test is listed somewhere the team sees it, with the date and a link to an issue. A test that sits quarantined is a bug to fix, not a permanent exemption.

## How to wire it per stack

**pytest** — mark flakes and exclude them from the gate; track retries with `pytest-rerunfailures`:

```python
@pytest.mark.flaky_quarantine   # registered in conftest; excluded from the gate run
def test_thing(): ...
```

```bash
# gate: real tests block; quarantined ones run separately and never fail the gate
pytest -m "not flaky_quarantine"
pytest -m "flaky_quarantine" --reruns 1 || true
```

**Jest / Vitest** — keep a quarantine list and run it separately:

```bash
jest --testPathIgnorePatterns quarantine          # the gate
jest quarantine --retries 1 || true               # informational
```

**Any stack** — the shape is the same: the gate runs the trusted suite; quarantined tests run in a separate, non-blocking step with exactly one retry that classifies the result.

## What this is not

It is **not** a blanket retry on the whole suite. Retrying everything hides real failures and is the exact gaming vector this prevents. Only known, individually-tagged tests get the single classifying retry.
