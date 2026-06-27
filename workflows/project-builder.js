export const meta = {
  name: 'project-builder',
  description: 'Contract-first, dependency-waved project/feature builder: architect locks contracts + a task graph; builder waves (own worktree, self-gated); a multi-lens adversarial review panel per task; PRs for human review. Handles dependency chains via an integration branch.',
  phases: [
    { title: 'Architect', detail: 'lock contracts + produce a dependency-ordered task graph' },
    { title: 'Build', detail: 'waves of builder agents (own worktree, self-gated)' },
    { title: 'Verify', detail: 'multi-lens adversarial review panel per task' },
  ],
}

// ---- args (defensive: may arrive as an object OR a JSON string; normalise both) ----
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}

const goal       = (typeof A.goal === 'string' && A.goal.trim()) ? A.goal.trim() : null
const repoPath   = A.repoPath || '.'
const gateCmd    = A.gateCmd || 'make ci'
// liteGateCmd: fast gate for code-only tasks (no pipeline). If omitted, ALL tasks use gateCmd.
// Example: 'make ci-lite' for a data project, 'npm run lint' for a Node app, 'flutter analyze' for a Flutter app.
const liteGateCmd = (typeof A.liteGateCmd === 'string' && A.liteGateCmd.trim()) ? A.liteGateCmd.trim() : null
// pipelinePatterns: file path substrings that indicate a task touches the data pipeline → forces gateCmd.
// Defaults cover the common case; override per-project if needed.
const pipelinePatterns = Array.isArray(A.pipelinePatterns) ? A.pipelinePatterns : [
  'transform/', 'migrations/', 'ingestion/', 'portfolio', 'stats.py', '/ml', '/ai/',
  'scripts/', '.sql', 'schema', 'pyproject.toml', 'package.json', 'pubspec.yaml',
  'Makefile', 'requirements', 'dashboard/',
]
// Returns the right gate for a task: lite (fast) if safe, full otherwise.
function selectGate(files) {
  if (!liteGateCmd) return gateCmd
  // A "required" field can still arrive null/omitted from the LLM. Without a concrete file list we
  // can't prove the task is code-only, so fall back to the full (safe) gate rather than the lite one.
  if (!Array.isArray(files) || files.length === 0) return gateCmd
  const needsFull = files.some((f) => pipelinePatterns.some((p) => f.includes(p)))
  return needsFull ? gateCmd : liteGateCmd
}
const stack      = A.stack || '(stack unspecified)'
const baseBranch = A.baseBranch || 'main'
const maxWave    = A.maxWaveWidth || 10
// SAFE DEFAULT: plan only. Building (opens PRs) requires an explicit args.execute === true.
const planOnly   = !(A.execute === true)
// reviewDepth: 'light'=1 lens sonnet/high (prototype), 'standard'=2 lenses opus/high (DEFAULT), 'full'=3 lenses opus/max (critical prod)
const reviewDepth = (A.reviewDepth === 'light' || A.reviewDepth === 'full') ? A.reviewDepth : 'standard'
// commitIdentity: the git author for builder commits + integration merges. Defaults to the repo owner
// to preserve current behavior; pass args.commitIdentity to reuse this kit under your own identity.
const commitIdentity = (typeof A.commitIdentity === 'string' && A.commitIdentity.trim())
  ? A.commitIdentity.trim()
  : 'mathsisbest <33107428+mathsisbest@users.noreply.github.com>' // ← swap for your identity

// Fail fast (and surface what actually arrived) rather than inventing a goal.
if (!goal) {
  return { ok: false, error: 'NO_GOAL — pass args.goal (plain-English description of what to build)',
           argsType: typeof args, argsSeen: args === undefined ? 'undefined' : (typeof args === 'string' ? String(args).slice(0, 200) : Object.keys(A)) }
}

log(`project-builder | goal="${goal}" | repo=${repoPath} | gate="${gateCmd}"${liteGateCmd ? ' | liteGate="'+liteGateCmd+'"' : ''} | mode=${planOnly ? 'PLAN-ONLY (no changes)' : 'EXECUTE (opens PRs)'} | reviewDepth=${reviewDepth}`)

// ========== Phase 1: ARCHITECT — lock contracts + dependency-ordered task graph ==========
phase('Architect')
const PLAN_SCHEMA = {
  type: 'object',
  required: ['summary', 'contracts', 'tasks'],
  properties: {
    summary: { type: 'string', description: 'one-paragraph approach' },
    contracts: { type: 'string', description: 'the LOCKED interfaces every builder must build against verbatim: data model/schema, API/function signatures, module boundaries, shared types, file layout' },
    risks: { type: 'string' },
    deferred: { type: 'string', description: 'what was scoped out of this build (be honest)' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'files', 'dependsOn', 'wave'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' }, description: 'files this task OWNS — disjoint from other tasks in the SAME wave' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'task ids that must land first' },
          wave: { type: 'integer', description: '1-based; same wave = independent + file-disjoint' },
          gate: { type: 'string', description: 'how this task proves itself' },
        },
      },
    },
  },
}

// --- Deep planner (opt-in: args.planDepth='deep'). scope -> ground -> design -> lock -> critique -> revise.
// Heavier (~12-18 agents); for large/uncertain builds. Returns the SAME PLAN_SCHEMA as the single architect,
// so the build/panel/integration phases are unchanged. Default stays the cheap single architect. ---
const SCOPE_SCHEMA = {
  type: 'object', required: ['pillars'],
  properties: { pillars: { type: 'array', items: { type: 'object', required: ['name', 'groundFocus'],
    properties: { name: { type: 'string' }, groundFocus: { type: 'string' } } } } },
}
async function deepPlan() {
  log('Planning depth: DEEP — scope -> ground -> design -> lock -> critique -> revise')
  const scope = await agent(
'Read the repo at ' + repoPath + ' and the GOAL below, then list 3-6 PILLARS (subsystems/areas) this goal touches. For each: a short name + groundFocus (the files/dirs/modules to map). GOAL:\n' + goal,
    { label: 'scope', phase: 'Architect', schema: SCOPE_SCHEMA, model: 'sonnet', effort: 'high' })
  const pillars = ((scope && scope.pillars) || []).slice(0, 6)
  if (!pillars.length) { log('Scope produced no pillars — aborting deep plan.'); return null }

  const grounds = await parallel(pillars.map((p) => () =>
    agent('Deeply MAP the "' + p.name + '" pillar from the REAL code in ' + repoPath + '. Focus: ' + p.groundFocus + '. Report exact function/class signatures, types, file layout, invariants, and gotchas a builder must respect. Read-only — change nothing.',
      { label: 'ground:' + p.name, phase: 'Architect', agentType: 'Explore', model: 'haiku', effort: 'low' })))

  const designs = await parallel(pillars.map((p, i) => () =>
    agent('Design the "' + p.name + '" piece for this goal, grounded in the map below. Produce: the contracts (interfaces/signatures it exposes or depends on) + candidate single-concern tasks (the files each would own).\nGOAL:\n' + goal + '\nGROUND-TRUTH MAP:\n' + (grounds[i] || '(none)'),
      { label: 'design:' + p.name, phase: 'Architect', model: 'opus', effort: 'medium' })))

  const locked = await agent(
'Synthesize these per-pillar designs into ONE unified plan: a single set of LOCKED contracts + a file-disjoint, dependency-ordered, waved task graph. Resolve overlaps; no two tasks in the same wave may share a file; dependencies must land in earlier waves. GOAL:\n' + goal + '\nPILLAR DESIGNS:\n' + designs.filter(Boolean).join('\n---\n'),
    { label: 'lock', phase: 'Architect', schema: PLAN_SCHEMA, model: 'opus', effort: 'high' })
  if (!locked) return null

  const CRITICS = [
    { k: 'completeness', focus: 'what is MISSING vs the goal — unhandled cases, omitted files, gaps' },
    { k: 'feasibility-ordering', focus: 'same-wave file collisions, wrong/missing dependsOn, DAG cycles, a task needing something not built yet' },
    { k: 'contract-integrity', focus: 'do the contracts match the REAL signatures/types in the code? invented/renamed APIs, wrong types, persistence-tuple/return-shape mismatches' },
  ]
  const critiques = await parallel(CRITICS.map((c) => () =>
    agent('Adversarially critique this plan on ' + c.k.toUpperCase() + ': ' + c.focus + '. Verify against the REAL code in ' + repoPath + '. Return concrete findings (each: severity + issue + fix).\nCONTRACTS:\n' + locked.contracts + '\nTASKS:\n' + JSON.stringify(locked.tasks),
      { label: 'critique:' + c.k, phase: 'Architect', model: 'sonnet', effort: 'high' })))

  const final = await agent(
'Produce the FINAL plan (same schema) folding in every VALID critic finding (ignore wrong ones; note why in risks). Keep tasks single-concern, file-disjoint within waves, dependency-ordered. GOAL:\n' + goal + '\nCURRENT CONTRACTS:\n' + locked.contracts + '\nCURRENT TASKS:\n' + JSON.stringify(locked.tasks) + '\nCRITIC FINDINGS:\n' + critiques.filter(Boolean).join('\n---\n'),
    { label: 'revise', phase: 'Architect', schema: PLAN_SCHEMA, model: 'opus', effort: 'high' })
  return final || locked
}

const useDeep = (A.planDepth === 'deep')
const plan = useDeep ? await deepPlan() : await agent(
`You are the ARCHITECT for a contract-first, parallel build.

GOAL:
${goal}

Repo: ${repoPath} (base branch ${baseBranch}). Stack: ${stack}. Gate command: \`${gateCmd}\`.

First GROUND yourself: ls the repo tree and read the key files (README / CLAUDE.md / pyproject or package.json / the modules you'll touch). Then produce:
1. summary — the approach in one paragraph.
2. contracts — the LOCKED interfaces every builder must build against verbatim (data model/schema, API or function signatures, module boundaries, shared types/enums, file layout). This is the most important output: it's what stops parallel agents from diverging into an incoherent codebase.
3. tasks — a dependency-ordered graph. Each task is single-concern (~1-5 files): id, title, files it OWNS (disjoint from siblings in the same wave), dependsOn (task ids), wave (1-based; same wave = independent + file-disjoint), and how it gates. Wave 1 has no deps (schema/contracts/scaffolding); later waves build on merged earlier ones. Keep each wave <= ${maxWave} tasks.

Be honest: if the goal is too big for one build, scope a coherent MVP and put the rest in "deferred".`,
  { label: 'architect', phase: 'Architect', schema: PLAN_SCHEMA, model: 'opus', effort: 'max' }
)

if (!plan) { log('Architect failed — aborting.'); return { ok: false, stage: 'architect' } }

const waves = {}
for (const t of plan.tasks) { (waves[t.wave] = waves[t.wave] || []).push(t) }
const waveNums = Object.keys(waves).map(Number).sort((a, b) => a - b)
log(`Architect done: ${plan.tasks.length} tasks across ${waveNums.length} wave(s). Contracts locked.`)

// --- Validate the LLM's dependency graph before trusting it to order the build. Every dependsOn must
//     reference a known task in a STRICTLY-earlier wave, ids must be unique, and the graph must be acyclic. ---
function validateWaveGraph(tasks) {
  const issues = []
  const byId = new Map()
  for (const t of tasks) {
    if (byId.has(t.id)) issues.push(`duplicate task id "${t.id}"`)
    byId.set(t.id, t)
  }
  for (const t of tasks) {
    for (const d of (Array.isArray(t.dependsOn) ? t.dependsOn : [])) {
      const dep = byId.get(d)
      if (!dep) { issues.push(`task ${t.id} dependsOn unknown task "${d}"`); continue }
      if (!(Number(dep.wave) < Number(t.wave))) {
        issues.push(`task ${t.id} (wave ${t.wave}) dependsOn ${d} (wave ${dep.wave}) — a dep must be in a strictly-earlier wave`)
      }
    }
  }
  // cycle detection (white/gray/black DFS over the dependsOn edges)
  const color = new Map(tasks.map((t) => [t.id, 0]))
  const cycles = []
  function dfs(id, path) {
    color.set(id, 1)
    const t = byId.get(id)
    for (const d of (t && Array.isArray(t.dependsOn) ? t.dependsOn : [])) {
      if (!byId.has(d)) continue
      if (color.get(d) === 1) {
        const full = path.concat(d)
        cycles.push(full.slice(full.indexOf(d)).join(' -> '))   // trim the approach prefix; report the cycle itself
        return true
      }
      if (color.get(d) === 0 && dfs(d, path.concat(d))) return true
    }
    color.set(id, 2)
    return false
  }
  for (const t of tasks) { if (color.get(t.id) === 0) dfs(t.id, [t.id]) }
  if (cycles.length) issues.push(`dependency cycle detected: ${cycles.join('; ')}`)
  return issues
}
const graphIssues = validateWaveGraph(plan.tasks)
if (graphIssues.length) log(`Dependency-graph problems:\n  - ${graphIssues.join('\n  - ')}`)

if (planOnly) {
  return {
    ok: true,
    mode: 'plan-only',
    summary: plan.summary,
    contracts: plan.contracts,
    risks: plan.risks || null,
    deferred: plan.deferred || null,
    graphIssues: graphIssues.length ? graphIssues : null,
    waves: waveNums.map(w => ({ wave: w, tasks: waves[w].map(t => ({ id: t.id, title: t.title, files: t.files, dependsOn: t.dependsOn })) })),
    note: 'PLAN-ONLY: no code written, no repo touched. Review the contracts + task graph, then re-run with args.execute=true to build.',
  }
}

// EXECUTE mode: a broken dependency graph would silently mis-order/clobber the build — abort instead.
if (graphIssues.length) {
  log('Aborting EXECUTE: the dependency graph is invalid (see above). Fix the plan or re-run the architect.')
  return { ok: false, stage: 'validate-graph', error: 'INVALID_WAVE_GRAPH', issues: graphIssues }
}

// ========== Phase 2: BUILD + VERIFY ==========
// Two modes, auto-detected from the dependency graph:
//   FLAT (single wave, no cross-task deps): each builder branches off the base branch and opens its
//     OWN PR; you merge each.
//   INTEGRATION (multi-wave deps): builders branch off a shared integration branch that accumulates
//     each wave; after a wave, its review-clean tasks merge into that branch so the next wave sees
//     them; at the end ONE PR (integration -> base) for your review. Nothing reaches the base un-gated.
phase('Build')

const BUILD_SCHEMA = {
  type: 'object',
  required: ['taskId', 'gatePassed', 'summary'],
  properties: {
    taskId: { type: 'string' }, gatePassed: { type: 'boolean' },
    ref: { type: 'string', description: 'PR url (flat mode) or pushed branch name (integration mode)' },
    summary: { type: 'string' },
  },
}

// --- Multi-lens adversarial review panel ---
// reviewDepth controls lenses + model:
//   'light'    → 1 lens (correctness only), sonnet/high  — prototype / throwaway
//   'standard' → 2 lenses (correctness + security), opus/high  — DEFAULT
//   'full'     → 3 lenses (correctness + security + contract), opus/max  — critical prod
const LENS_SCHEMA = {
  type: 'object', required: ['lens', 'solid'],
  properties: { lens: { type: 'string' }, solid: { type: 'boolean' }, issue: { type: 'string' } },
}
const ALL_LENSES = [
  { k: 'correctness', focus: 'logic errors, edge cases, off-by-one, error handling, resource leaks, wrong assumptions' },
  { k: 'security', focus: 'secret/key/redaction leaks, injection, unsafe input, anything that could expose a token in logs or the UI' },
  { k: 'contract', focus: 'does it match the LOCKED contract verbatim? unrelated changes, scope creep, or signature drift?' },
]
const ACTIVE_LENSES = reviewDepth === 'light' ? ALL_LENSES.slice(0, 1)
                    : reviewDepth === 'full'  ? ALL_LENSES
                    : ALL_LENSES.slice(0, 2)  // standard: correctness + security
const REVIEW_MODEL  = reviewDepth === 'light' ? 'sonnet' : 'opus'
const REVIEW_EFFORT = reviewDepth === 'full'  ? 'max'    : 'high'
log(`Review panel: ${ACTIVE_LENSES.map((l) => l.k).join('+')} | ${REVIEW_MODEL}/${REVIEW_EFFORT}`)

async function reviewPanel(taskId, ref) {
  // In integration mode `ref` is a pushed branch with NO PR, so `gh pr diff` would find nothing —
  // hand the reviewer the exact branch-vs-base delta. In flat mode `ref` is a PR url, so gh works.
  const diffHint = multiWave
    ? `Read the delta with: git -C ${repoPath} fetch origin -q && git -C ${repoPath} diff origin/${buildBase}...origin/${ref}`
    : `Read the diff with: gh pr diff ${ref} (or git diff)`
  const vs = await parallel(ACTIVE_LENSES.map((L) => () =>
    agent(
`Adversarially review the change for task ${taskId} (${ref}) THROUGH THE ${L.k.toUpperCase()} LENS ONLY.
Focus: ${L.focus}.
${diffHint}
Review that diff and the touched files. It must satisfy this LOCKED contract:
${plan.contracts}
Return lens="${L.k}" and solid=true ONLY if you find no real ${L.k} issue; otherwise solid=false with a specific issue (file:line).`,
      { label: `verify:${taskId}:${L.k}`, phase: 'Verify', schema: LENS_SCHEMA, model: REVIEW_MODEL, effort: REVIEW_EFFORT })
  ))
  const flagged = vs.filter(Boolean).filter((v) => !v.solid)
  return { taskId, clean: flagged.length === 0, flagged: flagged.map((v) => ({ lens: v.lens, issue: v.issue })) }
}

// Derive integration mode from REAL deps, not just wave count: a plan with cross-task deps must run
// in integration mode even if the architect flattened everything into one wave number.
const hasDeps = plan.tasks.some((t) => Array.isArray(t.dependsOn) && t.dependsOn.length > 0)
const multiWave = hasDeps || waveNums.length > 1
const slug = (goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'build'
// Run-unique token so worktree paths + the integration branch don't collide on a re-run after a crash
// (git worktree add hard-errors if the path exists). Date.now()/Math.random() are unavailable in Workflow
// scripts, so accept a stamp via args.runStamp (e.g. a timestamp) and otherwise fall back to the goal slug.
const runStamp = (typeof A.runStamp === 'string' && A.runStamp.trim())
  ? (A.runStamp.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || slug)
  : slug
const integrationBranch = `pb/${runStamp}`
const buildBase = multiWave ? integrationBranch : baseBranch

// Tiny ok/detail schema reused by the integration-init + per-wave integrator so success is verifiable.
const OK_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }

if (multiWave) {
  log(`Dependencies detected (${waveNums.length} wave(s)${hasDeps ? ', cross-task deps' : ''}) -> INTEGRATION mode on ${integrationBranch}`)
  const initRes = await agent(
`Set up a FRESH integration branch for a multi-wave build. Do NOT touch the main clone's current checkout. In repo ${repoPath} run:
  git -C ${repoPath} fetch origin ${baseBranch} -q
  git -C ${repoPath} branch -f ${integrationBranch} origin/${baseBranch}
  git -C ${repoPath} push -f origin ${integrationBranch}
Then verify the branch exists on origin (git -C ${repoPath} ls-remote --exit-code origin ${integrationBranch}).
Return ok=true only if that verification succeeds; otherwise ok=false with detail.`,
    { label: 'integration-init', phase: 'Build', schema: OK_SCHEMA, model: 'sonnet', effort: 'low' })
  if (!initRes || initRes.ok !== true) {
    log('Integration branch setup FAILED — aborting before any builder runs.')
    return { ok: false, stage: 'integration-init', error: 'INTEGRATION_BRANCH_SETUP_FAILED',
             branch: integrationBranch, detail: (initRes && initRes.detail) || 'agent returned no result' }
  }
} else {
  log(`Single wave, no cross-task deps -> FLAT mode (per-task PRs off ${baseBranch})`)
}

const built = []
const reviews = []
const integrated = new Set()   // task ids successfully merged into the integration branch
const skipped = []             // tasks not dispatched because a dependency never landed
const gateFailed = []          // tasks that ran but failed their gate (excluded from review + integration)
const flaggedOut = []          // gate-passed but review-flagged, so NOT integrated
for (const w of waveNums) {
  // Don't dispatch a task whose dependencies didn't land (gate-failed, review-flagged, dropped, or
  // skipped upstream). In flat mode there are no cross-wave deps to honor, so nothing is filtered.
  const runnable = []
  for (const t of waves[w]) {
    const unmet = multiWave ? (Array.isArray(t.dependsOn) ? t.dependsOn : []).filter((d) => !integrated.has(d)) : []
    if (unmet.length) {
      skipped.push({ id: t.id, unmet })
      log(`Wave ${w}: SKIP ${t.id} — dependencies not integrated: ${unmet.join(', ')}`)
    } else {
      runnable.push(t)
    }
  }
  if (!runnable.length) { log(`Wave ${w}: nothing runnable (all tasks skipped due to un-integrated deps).`); continue }

  log(`Wave ${w}: building ${runnable.length} task(s) in parallel (base: ${buildBase})`)
  const rawResults = await parallel(runnable.map((t) => () =>
    agent(
`You are a BUILDER. Implement EXACTLY this one task — nothing else, no unrelated refactors.

TASK ${t.id}: ${t.title}
Files you OWN (touch only these): ${JSON.stringify(t.files)}

Build against this LOCKED contract verbatim — do NOT change it:
---
${plan.contracts}
---

ISOLATION + DELIVERY:
1. git -C ${repoPath} fetch origin ${buildBase} -q
2. git -C ${repoPath} worktree remove --force /tmp/pb-${runStamp}-${t.id} 2>/dev/null || true
   git -C ${repoPath} worktree add -B builder/${t.id} /tmp/pb-${runStamp}-${t.id} origin/${buildBase}
3. Work ONLY in /tmp/pb-${runStamp}-${t.id}, editing only your owned files.
4. Run the gate (${selectGate(t.files)}). A fresh worktree may need its venv/deps installed first. Fix root causes (<=3 tries); never skip or suppress.
5. Commit authored as ${commitIdentity}, conventional title. Push branch builder/${t.id}.
${multiWave
  ? `6. DO NOT open a PR (integration mode) — just push the branch; it will be merged into ${integrationBranch}.`
  : `6. Open a PR with gh against ${baseBranch} (structured body + gate result). DO NOT merge.`}
7. git -C ${repoPath} worktree remove --force /tmp/pb-${runStamp}-${t.id}
Return taskId, gatePassed, and ref (${multiWave ? 'the pushed branch name' : 'the PR url'}).`,
      { label: `build:${t.id}`, phase: 'Build', schema: BUILD_SCHEMA, model: 'sonnet', effort: 'medium' }
    )
  ))
  const results = rawResults.filter(Boolean)
  built.push(...results)

  // A null result means a builder died/was skipped — surface which task(s) silently vanished.
  if (results.length < runnable.length) {
    const got = new Set(results.map((r) => r.taskId))
    const missing = runnable.filter((t) => !got.has(t.id)).map((t) => t.id)
    log(`Wave ${w}: ${runnable.length - results.length} builder(s) returned no result — missing: ${missing.join(', ') || '(taskId mismatch)'}`)
  }

  // Gate-failed tasks are excluded from review + integration — log them so they don't vanish silently.
  const waveGateFailed = results.filter((r) => !r.gatePassed).map((r) => r.taskId)
  if (waveGateFailed.length) {
    gateFailed.push(...waveGateFailed)
    log(`Wave ${w}: GATE FAILED (not reviewed, not integrated): ${waveGateFailed.join(', ')} (dependents will be skipped)`)
  }

  // Review each built + gated task with the lens panel
  const waveReviews = (await parallel(results.filter((r) => r.gatePassed).map((r) => () => reviewPanel(r.taskId, r.ref)))).filter(Boolean)
  reviews.push(...waveReviews)

  // Integration mode: merge this wave's review-clean tasks into the integration branch before the next wave
  if (multiWave) {
    const cleanIds = new Set(waveReviews.filter((v) => v.clean).map((v) => v.taskId))
    const merging = results.filter((r) => r.gatePassed && cleanIds.has(r.taskId)).map((r) => r.taskId)
    if (merging.length) {
      const integRes = await agent(
`Integrate wave ${w} into ${integrationBranch} using a DEDICATED worktree (never touch the main clone's current checkout):
  git -C ${repoPath} fetch origin -q
  git -C ${repoPath} worktree remove --force /tmp/pb-int-${runStamp}-${w} 2>/dev/null || true
  git -C ${repoPath} worktree add -B ${integrationBranch} /tmp/pb-int-${runStamp}-${w} origin/${integrationBranch}
Then, inside /tmp/pb-int-${runStamp}-${w}, merge these file-disjoint branches IN ORDER (no conflicts expected), authoring merges as ${commitIdentity}, and push ${integrationBranch}:
${merging.map((id) => `  - origin/builder/${id}`).join('\n')}
Finally: git -C ${repoPath} worktree remove --force /tmp/pb-int-${runStamp}-${w}. Return ok=true only if every branch merged AND the push succeeded; otherwise ok=false with detail.`,
        { label: `integrate:wave${w}`, phase: 'Build', schema: OK_SCHEMA, model: 'sonnet', effort: 'medium' })
      if (integRes && integRes.ok === true) {
        for (const id of merging) integrated.add(id)
      } else {
        log(`Wave ${w}: integration FAILED — ${merging.join(', ')} NOT integrated; downstream dependents will be skipped. ${(integRes && integRes.detail) || ''}`)
      }
    }
    const flagged = results.filter((r) => r.gatePassed && !cleanIds.has(r.taskId)).map((r) => r.taskId)
    if (flagged.length) {
      flaggedOut.push(...flagged)
      log(`Wave ${w}: review flagged, NOT integrated: ${flagged.join(', ')} (dependents will be skipped)`)
    }
  }
}

// Integration mode: open ONE final PR (integration -> base) for human review
phase('Verify')
let finalPr = null
if (multiWave) {
  if (integrated.size) {
    finalPr = await agent(
`Open ONE pull request from ${integrationBranch} to ${baseBranch} in repo ${repoPath} via gh.
Title: a conventional-commit summary of: ${goal}
Body: structured (Summary / What changed per task / Risk / how it was gated + multi-lens reviewed / Questions).
DO NOT merge — leave it for human review. Return the PR url.`,
      { label: 'final-pr', phase: 'Verify', model: 'sonnet', effort: 'low' })
  } else {
    log(`No task was integrated into ${integrationBranch} — skipping the final PR (it would be empty).`)
  }
}

const notLanded = { skipped, gateFailed, flaggedOut }
const anyNotLanded = skipped.length + gateFailed.length + flaggedOut.length > 0

return {
  ok: true,
  mode: multiWave ? 'execute:integration' : 'execute:flat',
  summary: plan.summary,
  waves: waveNums.length,
  tasks: plan.tasks.length,
  built,
  reviews,
  integrated: multiWave ? [...integrated] : null,
  notLanded,
  finalPr: finalPr || null,
  note: multiWave
    ? `Integration build done. ${integrated.size ? `ONE PR (${integrationBranch} -> ${baseBranch}) is OPEN` : 'NO PR opened (nothing integrated)'}; nothing merged to ${baseBranch}.${anyNotLanded ? ' Some tasks did NOT land — see notLanded (gate-failed / review-flagged / skipped-dependents).' : ''} Review the panel findings + the PR, then merge.`
    : `Per-task PRs are OPEN (flat mode); nothing merged.${anyNotLanded ? ' Some tasks did NOT land — see notLanded.' : ''} Review the panel findings, then merge the clean ones.`,
}
