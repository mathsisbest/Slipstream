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
// Example: 'make ci-lite' for mmi, 'npm run lint' for convene, 'flutter analyze' for offline-games.
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

if (planOnly) {
  return {
    ok: true,
    mode: 'plan-only',
    summary: plan.summary,
    contracts: plan.contracts,
    risks: plan.risks || null,
    deferred: plan.deferred || null,
    waves: waveNums.map(w => ({ wave: w, tasks: waves[w].map(t => ({ id: t.id, title: t.title, files: t.files, dependsOn: t.dependsOn })) })),
    note: 'PLAN-ONLY: no code written, no repo touched. Review the contracts + task graph, then re-run with args.execute=true to build.',
  }
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
  const vs = await parallel(ACTIVE_LENSES.map((L) => () =>
    agent(
`Adversarially review the change for task ${taskId} (${ref}) THROUGH THE ${L.k.toUpperCase()} LENS ONLY.
Focus: ${L.focus}.
Read the diff (gh pr diff / git diff) and the touched files. It must satisfy this LOCKED contract:
${plan.contracts}
Return lens="${L.k}" and solid=true ONLY if you find no real ${L.k} issue; otherwise solid=false with a specific issue (file:line).`,
      { label: `verify:${taskId}:${L.k}`, phase: 'Verify', schema: LENS_SCHEMA, model: REVIEW_MODEL, effort: REVIEW_EFFORT })
  ))
  const flagged = vs.filter(Boolean).filter((v) => !v.solid)
  return { taskId, clean: flagged.length === 0, flagged: flagged.map((v) => ({ lens: v.lens, issue: v.issue })) }
}

const multiWave = waveNums.length > 1
const slug = (goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'build'
const integrationBranch = `pb/${slug}`
const buildBase = multiWave ? integrationBranch : baseBranch

if (multiWave) {
  log(`Dependencies detected (${waveNums.length} waves) -> INTEGRATION mode on ${integrationBranch}`)
  await agent(
`Set up a FRESH integration branch for a multi-wave build. Do NOT touch the main clone's current checkout. In repo ${repoPath} run:
  git -C ${repoPath} fetch origin ${baseBranch} -q
  git -C ${repoPath} branch -f ${integrationBranch} origin/${baseBranch}
  git -C ${repoPath} push -f origin ${integrationBranch}
Confirm the branch exists on origin.`,
    { label: 'integration-init', phase: 'Build', model: 'sonnet', effort: 'low' })
} else {
  log(`Single wave, no cross-task deps -> FLAT mode (per-task PRs off ${baseBranch})`)
}

const built = []
const reviews = []
for (const w of waveNums) {
  log(`Wave ${w}: building ${waves[w].length} task(s) in parallel (base: ${buildBase})`)
  const results = (await parallel(waves[w].map((t) => () =>
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
2. git -C ${repoPath} worktree add -b builder/${t.id} /tmp/pb-${t.id} origin/${buildBase}
3. Work ONLY in /tmp/pb-${t.id}, editing only your owned files.
4. Run the gate (${selectGate(t.files)}). A fresh worktree may need its venv/deps installed first. Fix root causes (<=3 tries); never skip or suppress.
5. Commit authored as mathsisbest <33107428+mathsisbest@users.noreply.github.com>, conventional title. Push branch builder/${t.id}.
${multiWave
  ? `6. DO NOT open a PR (integration mode) — just push the branch; it will be merged into ${integrationBranch}.`
  : `6. Open a PR with gh against ${baseBranch} (structured body + gate result). DO NOT merge.`}
7. git -C ${repoPath} worktree remove /tmp/pb-${t.id}
Return taskId, gatePassed, and ref (${multiWave ? 'the pushed branch name' : 'the PR url'}).`,
      { label: `build:${t.id}`, phase: 'Build', schema: BUILD_SCHEMA, model: 'sonnet', effort: 'medium' }
    )
  ))).filter(Boolean)
  built.push(...results)

  // Review each built + gated task with the 3-lens panel
  const waveReviews = (await parallel(results.filter((r) => r.gatePassed).map((r) => () => reviewPanel(r.taskId, r.ref)))).filter(Boolean)
  reviews.push(...waveReviews)

  // Integration mode: merge this wave's review-clean tasks into the integration branch before the next wave
  if (multiWave) {
    const cleanIds = new Set(waveReviews.filter((v) => v.clean).map((v) => v.taskId))
    const toMerge = results.filter((r) => r.gatePassed && cleanIds.has(r.taskId)).map((r) => `builder/${r.taskId}`)
    if (toMerge.length) {
      await agent(
`Integrate wave ${w} into ${integrationBranch} using a DEDICATED worktree (never touch the main clone's current checkout):
  git -C ${repoPath} fetch origin -q
  git -C ${repoPath} worktree add /tmp/pb-int-${w} ${integrationBranch}
Then, inside /tmp/pb-int-${w}, merge these file-disjoint branches IN ORDER (no conflicts expected), authoring merges as mathsisbest, and push ${integrationBranch}:
${toMerge.map((b) => `  - origin/${b}`).join('\n')}
Finally: git -C ${repoPath} worktree remove /tmp/pb-int-${w}. Report which branches merged.`,
        { label: `integrate:wave${w}`, phase: 'Build', model: 'sonnet', effort: 'medium' })
    }
    const dropped = results.filter((r) => r.gatePassed && !cleanIds.has(r.taskId)).map((r) => r.taskId)
    if (dropped.length) log(`Wave ${w}: review flagged, NOT integrated: ${dropped.join(', ')} (dependents may be affected)`)
  }
}

// Integration mode: open ONE final PR (integration -> base) for human review
phase('Verify')
let finalPr = null
if (multiWave) {
  finalPr = await agent(
`Open ONE pull request from ${integrationBranch} to ${baseBranch} in repo ${repoPath} via gh.
Title: a conventional-commit summary of: ${goal}
Body: structured (Summary / What changed per task / Risk / how it was gated + multi-lens reviewed / Questions).
DO NOT merge — leave it for human review. Return the PR url.`,
    { label: 'final-pr', phase: 'Verify', model: 'sonnet', effort: 'low' })
}

return {
  ok: true,
  mode: multiWave ? 'execute:integration' : 'execute:flat',
  summary: plan.summary,
  waves: waveNums.length,
  tasks: plan.tasks.length,
  built,
  reviews,
  finalPr: finalPr || null,
  note: multiWave
    ? `Integration build done. ONE PR (${integrationBranch} -> ${baseBranch}) is OPEN; nothing merged to ${baseBranch}. Review the panel findings + the PR, then merge.`
    : 'Per-task PRs are OPEN (flat mode); nothing merged. Review the panel findings, then merge the clean ones.',
}
