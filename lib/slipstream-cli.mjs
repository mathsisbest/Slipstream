#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PORT = 7331

function usage() {
  console.log(`Usage:
  slipstream doctor [--repo PATH] [--json]
  slipstream init PATH --stack node|python|flutter [--with-claude-hooks] [--force]
  slipstream check [PATH] [--json] [--run-gate] [--expect-hooks]
  slipstream plan --repo PATH --goal TEXT [--stack STACK] [--gate-cmd CMD] [--run-stamp ID] [--workflow-command CMD|--runtime codex] [--json]
  slipstream run --repo PATH --run-stamp ID --execute [--workflow-command CMD|--runtime codex] [--json]
  slipstream status [PATH] [--json]
  slipstream dashboard [--repo PATH] [--host HOST] [--port PORT]

Commands:
  doctor     Check local machine prerequisites and billing traps.
  init       Install Slipstream files into a target repo.
  check      Audit a repo for production-ready agent workflow wiring.
  plan       Create a plan-only project-builder run record, optionally invoking a workflow adapter.
  run        Execute a saved plan through a workflow adapter. Requires --execute.
  status     Show Slipstream runs, branches, PRs, and readiness for a repo.
  dashboard  Start the local dashboard server.
`)
}

function die(message, code = 1) {
  console.error(`slipstream: ${message}`)
  process.exit(code)
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out._.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

function commandExists(name) {
  return spawnSync('sh', ['-c', `command -v ${shellQuote(name)} >/dev/null 2>&1`], { stdio: 'ignore' }).status === 0
}

function run(cmd, args = [], options = {}) {
  return spawnSync(cmd, args, {
    cwd: options.cwd || process.cwd(),
    input: options.input,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: options.shell || false,
    timeout: options.timeout || 120000,
  })
}

function runShell(command, options = {}) {
  return run(command, [], { ...options, shell: true })
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function copyFile(src, dest, force, events) {
  if (existsSync(dest) && !force) {
    events.push({ action: 'kept', path: dest })
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  events.push({ action: 'copied', path: dest })
}

function walkFiles(root) {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function copyDir(src, dest, force, events) {
  for (const file of walkFiles(src)) {
    copyFile(file, join(dest, relative(src, file)), force, events)
  }
}

function ensureGitignore(targetRoot, events) {
  const path = join(targetRoot, '.gitignore')
  const existing = readText(path)
  const needed = ['.env', '.env.*', '.slipstream/']
  const missing = needed.filter((line) => !new RegExp(`(^|\\n)${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\n|$)`).test(existing))
  if (!missing.length) {
    events.push({ action: 'kept', path })
    return
  }
  const block = `${existing && !existing.endsWith('\n') ? '\n' : ''}\n# Slipstream local state and secrets\n${missing.join('\n')}\n`
  writeText(path, existing + block)
  events.push({ action: existing ? 'updated' : 'wrote', path })
}

function repoRoot(path) {
  const target = resolve(path || process.cwd())
  const res = run('git', ['-C', target, 'rev-parse', '--show-toplevel'])
  return res.status === 0 ? res.stdout.trim() : target
}

function stackDefaults(stack) {
  const defaults = {
    node: {
      build: 'npm run build --if-present',
      test: 'npm test',
      run: 'npm run dev',
      makefile: `.PHONY: ci ci-lite

ci-lite:
\tnpm run lint --if-present
\tnpm run typecheck --if-present
\tnpm test

ci: ci-lite
\tnpm run build --if-present
\t@echo "make ci: PASS"
`,
      ci: `name: CI

on:
  pull_request:
    branches: ["main", "master"]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: make ci
`,
    },
    python: {
      build: 'python -m compileall .',
      test: 'pytest -q',
      run: 'python -m your_app',
      makefile: `.PHONY: ci ci-lite

ci-lite:
\tpython -m compileall .
\tpytest -q

ci: ci-lite
\t@echo "make ci: PASS"
`,
      ci: `name: CI

on:
  pull_request:
    branches: ["main", "master"]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: |
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install -e ".[dev]"; fi
      - run: make ci
`,
    },
    flutter: {
      build: 'flutter analyze',
      test: 'flutter test',
      run: 'flutter run',
      makefile: `.PHONY: ci ci-lite

ci-lite:
\tflutter analyze
\tflutter test

ci: ci-lite
\t@echo "make ci: PASS"
`,
      ci: `name: CI

on:
  pull_request:
    branches: ["main", "master"]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true
      - run: flutter pub get
      - run: make ci
`,
    },
  }
  if (!defaults[stack]) die(`unknown stack '${stack}' (expected node, python, or flutter)`)
  return defaults[stack]
}

function agentTemplate(stack) {
  const d = stackDefaults(stack)
  return `# Agent Guide

> This is the canonical instruction file for agents working in this repo. Keep it under ~200 lines. \`CLAUDE.md\` imports it so Claude Code picks up these rules; Codex reads \`AGENTS.md\` directly. Both get the same rules.

## Project

This project uses the ${stack} Slipstream defaults. Keep this section short; agents should read the code for structure.

- **Build:** \`${d.build}\`
- **Test:** \`${d.test}\`
- **Gate (run before every PR):** \`make ci\`
- **Run locally:** \`${d.run}\`

## How to work here

- **Plan before you build.** For anything non-trivial, write the plan first (files you'll touch, the approach) and get it confirmed before editing.
- **One concern per change.** A PR does one thing. If you find a second thing worth fixing, note it; don't fold it in.
- **Gate yourself before opening a PR.** Run the gate command above. Paste the result in the PR. A green build that never exercised the changed path is not a gate.
- **Match the surrounding code.** Follow the conventions already in the file you're editing. Don't reformat or refactor code you weren't asked to touch.
- **Isolate parallel work.** When several tasks run at once, each works in its own \`git worktree\` and owns a disjoint set of files.

## Model tiering

- **Haiku** for pure read/search fan-out.
- **Sonnet** for implementation and standard changes. This is the default.
- **Opus** only for genuine multi-step reasoning: ambiguous design, hard debugging.
- Reserve max-effort multi-agent runs for genuinely hard problems, not routine edits.

## Boundaries

**Always (do without asking):**
- Read any file, run the gate, run tests, search the codebase.
- Make the smallest change that satisfies the task.
- Fix a failing gate by addressing the root cause.

**Ask first (stop and check):**
- Changing a public API, a data schema, or a migration.
- Adding a dependency.
- Deleting or rewriting a file you didn't create.
- Anything that touches auth, secrets, billing, or production config.

**Never:**
- Merge your own work, or push to the default branch directly.
- Commit secrets, tokens, or \`.env\` contents. Keys live in the environment or a keychain, never in code, logs, or config.
- Suppress or skip a failing test to make the gate pass.
- Weaken the gate to get a change through.
`
}

function renderHumanChecks(title, checks) {
  console.log(title)
  for (const c of checks) {
    const mark = c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARN' : 'FAIL'
    console.log(`  ${mark.padEnd(4)} ${c.name}${c.detail ? ` - ${c.detail}` : ''}`)
  }
}

function summarizeChecks(checks) {
  return {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  }
}

function doctorData(repoPath = process.cwd()) {
  const checks = []
  const add = (status, name, detail = '') => checks.push({ status, name, detail })

  for (const cmd of ['git', 'node', 'jq']) {
    if (commandExists(cmd)) {
      const version = cmd === 'node'
        ? process.version
        : runShell(`${cmd} --version`).stdout.trim().split('\n')[0]
      add('pass', cmd, version)
    } else {
      add(cmd === 'jq' ? 'warn' : 'fail', cmd, 'not found')
    }
  }

  const runtimes = ['claude', 'codex'].filter(commandExists)
  if (runtimes.length) add('pass', 'agent runtime', runtimes.join(', '))
  else add('warn', 'agent runtime', 'no claude or codex CLI found')

  if (commandExists('gh')) {
    const auth = run('gh', ['auth', 'status'], { timeout: 10000 })
    add(auth.status === 0 ? 'pass' : 'warn', 'gh auth', auth.status === 0 ? 'authenticated' : 'gh found but not authenticated')
  } else {
    add('warn', 'gh', 'not found; PR/status features will be local-only')
  }

  if (process.env.ANTHROPIC_API_KEY) add('fail', 'ANTHROPIC_API_KEY', 'set; Claude Code may use metered API mode')
  else add('pass', 'ANTHROPIC_API_KEY', 'not set')

  if (process.env.OPENAI_API_KEY) add('fail', 'OPENAI_API_KEY', 'set; Codex may use metered API mode')
  else add('pass', 'OPENAI_API_KEY', 'not set')

  const git = run('git', ['-C', resolve(repoPath), 'rev-parse', '--is-inside-work-tree'])
  add(git.status === 0 ? 'pass' : 'warn', 'git repository', git.status === 0 ? repoRoot(repoPath) : 'current path is not in a git repo')

  return { ok: checks.every((c) => c.status !== 'fail'), checks, summary: summarizeChecks(checks) }
}

function cmdDoctor(args) {
  const data = doctorData(args.repo || args._[0] || process.cwd())
  if (args.json) console.log(JSON.stringify(data, null, 2))
  else renderHumanChecks('Slipstream doctor', data.checks)
  process.exit(data.ok ? 0 : 1)
}

function cmdInit(args) {
  const target = args._[0]
  if (!target) die('init needs a target path')
  const stack = args.stack
  if (!stack) die('init needs --stack node|python|flutter')
  const force = Boolean(args.force)
  const withHooks = Boolean(args['with-claude-hooks'] || args['with-hooks'])
  const targetRoot = resolve(target)
  const d = stackDefaults(stack)
  const events = []

  mkdirSync(targetRoot, { recursive: true })
  const writeGenerated = (dest, content) => {
    if (existsSync(dest) && !force) {
      events.push({ action: 'kept', path: dest })
      return
    }
    writeText(dest, content)
    events.push({ action: 'wrote', path: dest })
  }

  writeGenerated(join(targetRoot, 'AGENTS.md'), agentTemplate(stack))
  copyFile(join(ROOT, 'templates', 'CLAUDE.md'), join(targetRoot, 'CLAUDE.md'), force, events)
  writeGenerated(join(targetRoot, 'Makefile'), d.makefile)
  writeGenerated(join(targetRoot, '.github', 'workflows', 'ci.yml'), d.ci)
  copyFile(join(ROOT, 'docs', 'REVIEW_GUIDE.md'), join(targetRoot, 'REVIEW_GUIDE.md'), force, events)
  copyFile(join(ROOT, '.github', 'pull_request_template.md'), join(targetRoot, '.github', 'pull_request_template.md'), force, events)
  copyDir(join(ROOT, '.github', 'ISSUE_TEMPLATE'), join(targetRoot, '.github', 'ISSUE_TEMPLATE'), force, events)
  ensureGitignore(targetRoot, events)

  if (withHooks) {
    copyDir(join(ROOT, 'hooks'), join(targetRoot, 'hooks'), force, events)
    for (const file of walkFiles(join(targetRoot, 'hooks'))) {
      if (file.endsWith('.sh')) chmodSync(file, 0o755)
    }
    const settings = join(targetRoot, '.claude', 'settings.json')
    if (existsSync(settings) && !force) {
      copyFile(join(ROOT, 'hooks', 'settings.fragment.json'), join(targetRoot, '.claude', 'settings.slipstream.fragment.json'), true, events)
      events.push({ action: 'note', path: 'existing .claude/settings.json kept; merge settings.slipstream.fragment.json manually' })
    } else {
      copyFile(join(ROOT, 'hooks', 'settings.fragment.json'), settings, true, events)
    }
  } else {
    events.push({ action: 'note', path: 'skipped Claude Code hooks; pass --with-claude-hooks to install them' })
  }

  for (const e of events) console.log(`  ${e.action} ${e.path}`)
  console.log(`  done. In ${targetRoot}: run make ci, then adapt AGENTS.md project details.`)
}

function checkFile(checks, repo, rel, label = rel) {
  const path = join(repo, rel)
  if (existsSync(path)) checks.push({ status: 'pass', name: label, detail: rel })
  else checks.push({ status: 'fail', name: label, detail: 'missing' })
  return path
}

function checkAnyFile(checks, repo, rels, label) {
  const found = rels.find((rel) => existsSync(join(repo, rel)))
  if (found) checks.push({ status: 'pass', name: label, detail: found })
  else checks.push({ status: 'fail', name: label, detail: `missing (${rels.join(' or ')})` })
}

function checkData(pathArg, options = {}) {
  const repo = repoRoot(pathArg || process.cwd())
  const checks = []
  const add = (status, name, detail = '') => checks.push({ status, name, detail })

  const agents = checkFile(checks, repo, 'AGENTS.md')
  const agentText = readText(agents)
  if (agentText) {
    const hasPlaceholders = /\[command\]|\[One or two|make ci, or npm run/.test(agentText)
    add(hasPlaceholders ? 'fail' : 'pass', 'AGENTS.md concrete commands', hasPlaceholders ? 'placeholder text remains' : 'no template placeholders found')
    add(/Gate \(run before every PR\).*make ci/.test(agentText.replace(/\s+/g, ' '))
      ? 'pass' : 'warn', 'AGENTS.md gate', 'expected make ci')
  }

  const makefile = checkFile(checks, repo, 'Makefile')
  const makeText = readText(makefile)
  if (makeText) add(/^ci:/m.test(makeText) ? 'pass' : 'fail', 'Makefile ci target', /^ci:/m.test(makeText) ? 'found' : 'missing')

  const ci = checkFile(checks, repo, '.github/workflows/ci.yml', 'GitHub CI')
  const ciText = readText(ci)
  if (ciText) add(/make ci/.test(ciText) ? 'pass' : 'warn', 'CI runs make ci', /make ci/.test(ciText) ? 'found' : 'CI exists but may not mirror local gate')

  checkFile(checks, repo, '.github/pull_request_template.md', 'PR template')
  checkFile(checks, repo, '.github/ISSUE_TEMPLATE/slice.md', 'slice issue template')
  checkAnyFile(checks, repo, ['REVIEW_GUIDE.md', 'docs/REVIEW_GUIDE.md'], 'fresh review guide')

  const gitignore = readText(join(repo, '.gitignore'))
  add(/(^|\n)\.env(\n|$)/.test(gitignore) && /(^|\n)\.env\.\*(\n|$)/.test(gitignore) ? 'pass' : 'warn', 'secret ignore rules', gitignore ? 'checked .gitignore' : '.gitignore missing')
  add(/(^|\n)\.slipstream\/?(\n|$)/.test(gitignore) ? 'pass' : 'warn', 'local run state ignored', gitignore ? 'checked .gitignore' : '.gitignore missing')

  if (options.expectHooks) {
    checkFile(checks, repo, '.claude/settings.json', 'Claude Code hook settings')
    checkFile(checks, repo, 'hooks/guard-bash.sh', 'bash guard hook')
    checkFile(checks, repo, 'hooks/guard-write.sh', 'write guard hook')
  }

  if (options.runGate) {
    const gate = run('make', ['ci'], { cwd: repo, timeout: 300000 })
    add(gate.status === 0 ? 'pass' : 'fail', 'make ci', gate.status === 0 ? 'passed' : (gate.stderr || gate.stdout || 'failed').trim().slice(0, 500))
  }

  const summary = summarizeChecks(checks)
  return { ok: summary.fail === 0, repo, checks, summary }
}

function cmdCheck(args) {
  const data = checkData(args.repo || args._[0] || process.cwd(), {
    runGate: Boolean(args['run-gate']),
    expectHooks: Boolean(args['expect-hooks']),
  })
  if (args.json) console.log(JSON.stringify(data, null, 2))
  else renderHumanChecks(`Slipstream check: ${data.repo}`, data.checks)
  process.exit(data.ok ? 0 : 1)
}

function runId(input) {
  const raw = input || new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'run'
}

function runsDir(repo) {
  return join(repo, '.slipstream', 'runs')
}

function runDir(repo, stamp) {
  return join(runsDir(repo), stamp)
}

function loadRuns(repo) {
  const dir = runsDir(repo)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => readJson(join(dir, name, 'run.json')))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function saveRun(repo, record) {
  const now = new Date().toISOString()
  const next = { ...record, updatedAt: now, createdAt: record.createdAt || now }
  writeJson(join(runDir(repo, next.runStamp), 'run.json'), next)
  return next
}

function workflowArgs(record, execute) {
  return {
    goal: record.goal,
    repoPath: record.repo,
    gateCmd: record.gateCmd || 'make ci',
    stack: record.stack || '(stack unspecified)',
    baseBranch: record.baseBranch || 'main',
    runStamp: record.runStamp,
    execute,
  }
}

function runWorkflow(command, argsObj, cwd, outFile) {
  const input = `${JSON.stringify(argsObj, null, 2)}\n`
  const res = runShell(command, {
    cwd,
    input,
    env: { ...process.env, SLIPSTREAM_ARGS_JSON: JSON.stringify(argsObj) },
    timeout: 3600000,
  })
  writeText(outFile, `COMMAND: ${command}\nEXIT: ${res.status}\n\nSTDOUT:\n${res.stdout || ''}\n\nSTDERR:\n${res.stderr || ''}`)
  return res
}

function codexExec(repo, prompt, outFile, options = {}) {
  if (!commandExists('codex')) return { status: 127, stderr: 'codex CLI not found', stdout: '' }
  const args = [
    'exec',
    '-C', repo,
    '--sandbox', options.sandbox || 'read-only',
    '--ask-for-approval', 'never',
    '--output-last-message', outFile,
    prompt,
  ]
  const res = run('codex', args, { cwd: repo, timeout: options.timeout || 3600000 })
  const transcript = `${outFile}.transcript.txt`
  writeText(transcript, `COMMAND: codex ${args.map(shellQuote).join(' ')}\nEXIT: ${res.status}\n\nSTDOUT:\n${res.stdout || ''}\n\nSTDERR:\n${res.stderr || ''}`)
  return { ...res, transcript }
}

function codexPlanPrompt(record, projectArgs) {
  return `You are the Slipstream architect. Read this repository and produce a plan only; do not edit files.

Goal:
${record.goal}

Gate command:
${record.gateCmd}

Return a concise plan with:
1. summary
2. locked contracts and interfaces
3. risks
4. deferred scope
5. dependency-ordered tasks with id, title, owned files, dependsOn, wave, and gate

The plan must preserve Slipstream's rule: same-wave tasks must own disjoint files.`
}

function codexRunPrompt(record, projectArgs, planText) {
  return `You are a Slipstream builder running from a saved plan.

Goal:
${record.goal}

Project-builder args:
${JSON.stringify(projectArgs, null, 2)}

Saved plan/context:
${planText || '(no saved Codex plan output found; inspect the repo before editing)'}

Implement the smallest correct change toward the goal. Follow AGENTS.md. Run the gate (${record.gateCmd}). Do not merge. If you can open a PR safely, open it; otherwise leave the branch and a clear summary.`
}

function cmdPlan(args) {
  const repo = repoRoot(args.repo || args._[0] || process.cwd())
  const goal = args.goal
  if (!goal) die('plan needs --goal "..."')
  const stamp = runId(args['run-stamp'])
  const record = saveRun(repo, {
    runStamp: stamp,
    repo,
    goal,
    stack: args.stack || detectStack(repo),
    gateCmd: args['gate-cmd'] || args.gate || 'make ci',
    baseBranch: args['base-branch'] || 'main',
    status: 'plan-ready',
    mode: 'plan',
    workflowCommand: args['workflow-command'] || null,
    runtime: args.runtime || null,
    projectBuilderArgs: null,
  })
  const projectArgs = workflowArgs(record, false)
  const next = saveRun(repo, { ...record, projectBuilderArgs: projectArgs })

  if (args.runtime === 'codex') {
    const outPath = join(runDir(repo, stamp), 'codex-plan.md')
    const res = codexExec(repo, codexPlanPrompt(next, projectArgs), outPath, { sandbox: 'read-only' })
    saveRun(repo, { ...next, status: res.status === 0 ? 'planned' : 'plan-failed', runtime: 'codex', lastOutput: outPath, lastTranscript: res.transcript, lastExit: res.status })
  } else if (args['workflow-command']) {
    const outPath = join(runDir(repo, stamp), 'plan-output.txt')
    const res = runWorkflow(args['workflow-command'], projectArgs, repo, outPath)
    saveRun(repo, { ...next, status: res.status === 0 ? 'planned' : 'plan-failed', lastCommand: args['workflow-command'], lastOutput: outPath, lastExit: res.status })
  }

  if (args.json) console.log(JSON.stringify(readJson(join(runDir(repo, stamp), 'run.json')), null, 2))
  else {
    console.log(`Plan record: ${join(runDir(repo, stamp), 'run.json')}`)
    console.log(`Run stamp: ${stamp}`)
    console.log('Project-builder args:')
    console.log(JSON.stringify(projectArgs, null, 2))
    if (!args['workflow-command'] && args.runtime !== 'codex') console.log('No workflow command supplied; pass --workflow-command or --runtime codex to invoke an agent workflow adapter.')
  }
}

function cmdRun(args) {
  const repo = repoRoot(args.repo || args._[0] || process.cwd())
  const stamp = args['run-stamp']
  if (!stamp) die('run needs --run-stamp ID')
  if (!args.execute) die('run needs --execute; this command can create branches and PRs')
  const recordPath = join(runDir(repo, stamp), 'run.json')
  const record = readJson(recordPath)
  if (!record) die(`no saved run found at ${recordPath}`)
  const projectArgs = workflowArgs(record, true)
  const runtime = args.runtime || record.runtime
  const command = args['workflow-command'] || record.workflowCommand
  if (runtime === 'codex') {
    const outPath = join(runDir(repo, stamp), 'codex-run.md')
    const planText = readText(join(runDir(repo, stamp), 'codex-plan.md')) || readText(record.lastOutput || '')
    saveRun(repo, { ...record, status: 'running', runtime: 'codex', projectBuilderArgs: projectArgs })
    const res = codexExec(repo, codexRunPrompt(record, projectArgs, planText), outPath, { sandbox: 'workspace-write' })
    const next = saveRun(repo, { ...record, status: res.status === 0 ? 'run-finished' : 'run-failed', runtime: 'codex', projectBuilderArgs: projectArgs, lastOutput: outPath, lastTranscript: res.transcript, lastExit: res.status })
    if (args.json) console.log(JSON.stringify(next, null, 2))
    else console.log(`Run ${stamp}: ${next.status}. Output: ${outPath}`)
    process.exit(res.status === 0 ? 0 : 1)
  }
  if (!command) {
    const next = saveRun(repo, { ...record, status: 'needs-workflow-command', projectBuilderArgs: projectArgs })
    if (args.json) console.log(JSON.stringify(next, null, 2))
    else {
      console.log('No workflow command supplied. Saved executable args for your workflow adapter:')
      console.log(JSON.stringify(projectArgs, null, 2))
    }
    return
  }
  const outPath = join(runDir(repo, stamp), 'run-output.txt')
  saveRun(repo, { ...record, status: 'running', workflowCommand: command, projectBuilderArgs: projectArgs })
  const res = runWorkflow(command, projectArgs, repo, outPath)
  const next = saveRun(repo, { ...record, status: res.status === 0 ? 'run-finished' : 'run-failed', workflowCommand: command, projectBuilderArgs: projectArgs, lastOutput: outPath, lastExit: res.status })
  if (args.json) console.log(JSON.stringify(next, null, 2))
  else console.log(`Run ${stamp}: ${next.status}. Output: ${outPath}`)
  process.exit(res.status === 0 ? 0 : 1)
}

function detectStack(repo) {
  if (existsSync(join(repo, 'package.json'))) return 'node'
  if (existsSync(join(repo, 'pyproject.toml')) || existsSync(join(repo, 'requirements.txt'))) return 'python'
  if (existsSync(join(repo, 'pubspec.yaml'))) return 'flutter'
  return '(stack unspecified)'
}

function gitInfo(repo) {
  const branch = run('git', ['-C', repo, 'branch', '--show-current']).stdout.trim()
  const status = run('git', ['-C', repo, 'status', '--short']).stdout.trim()
  const refs = run('git', ['-C', repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/pb', 'refs/remotes/origin/pb']).stdout
    .split('\n').map((s) => s.trim()).filter(Boolean)
  return { branch, dirty: Boolean(status), status, slipstreamRefs: refs }
}

function ghPrs(repo) {
  if (!commandExists('gh')) return { available: false, prs: [], error: 'gh not found' }
  const res = run('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,baseRefName,isDraft,url'], { cwd: repo, timeout: 30000 })
  if (res.status !== 0) return { available: false, prs: [], error: (res.stderr || res.stdout || 'gh failed').trim() }
  return { available: true, prs: readJsonFromString(res.stdout, []) }
}

function readJsonFromString(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function statusData(pathArg) {
  const repo = repoRoot(pathArg || process.cwd())
  const check = checkData(repo)
  return {
    repo,
    generatedAt: new Date().toISOString(),
    check,
    git: gitInfo(repo),
    runs: loadRuns(repo),
    github: ghPrs(repo),
  }
}

function cmdStatus(args) {
  const data = statusData(args.repo || args._[0] || process.cwd())
  if (args.json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }
  console.log(`Slipstream status: ${data.repo}`)
  console.log(`Readiness: ${data.check.summary.fail} fail, ${data.check.summary.warn} warn, ${data.check.summary.pass} pass`)
  console.log(`Git: ${data.git.branch || '(detached)'}${data.git.dirty ? ' dirty' : ' clean'}`)
  console.log(`Runs: ${data.runs.length}`)
  for (const r of data.runs.slice(0, 8)) {
    console.log(`  ${r.runStamp}  ${String(r.status || '').padEnd(22)}  ${r.goal}`)
  }
  if (data.github.available) {
    console.log(`Open PRs: ${data.github.prs.length}`)
    for (const pr of data.github.prs.slice(0, 8)) console.log(`  #${pr.number} ${pr.title} (${pr.headRefName})`)
  } else {
    console.log(`Open PRs: unavailable (${data.github.error})`)
  }
}

function dashboardHtml(defaultRepo) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Slipstream Dashboard</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#607080; --line:#d9e1e7; --bg:#f6f8fa; --panel:#ffffff; --good:#16784b; --warn:#9a6700; --bad:#b42318; --accent:#2563eb; }
    * { box-sizing: border-box; }
    body { margin:0; font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
    header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 24px; background:#101820; color:white; }
    h1 { margin:0; font-size:20px; font-weight:650; }
    main { padding:20px 24px 32px; max-width:1280px; margin:0 auto; }
    .repo { display:flex; gap:8px; min-width:360px; }
    input { width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:6px; font:inherit; }
    button { padding:9px 12px; border:1px solid #174ea6; border-radius:6px; background:var(--accent); color:white; font-weight:650; cursor:pointer; }
    .grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; margin:18px 0; }
    .metric, section { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    .metric { padding:14px; }
    .metric .label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
    .metric .value { font-size:26px; font-weight:720; margin-top:4px; }
    section { margin-top:14px; overflow:hidden; }
    section h2 { margin:0; padding:13px 14px; font-size:15px; border-bottom:1px solid var(--line); background:#fbfcfd; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { color:var(--muted); font-size:12px; text-transform:uppercase; background:#fbfcfd; }
    .status { display:inline-block; min-width:48px; padding:2px 7px; border-radius:999px; font-size:12px; font-weight:700; border:1px solid transparent; }
    .pass { color:var(--good); background:#eaf7ef; border-color:#b9e3ca; }
    .warn { color:var(--warn); background:#fff7df; border-color:#eed38a; }
    .fail { color:var(--bad); background:#fff0ee; border-color:#f1b8b2; }
    .muted { color:var(--muted); }
    .two { display:grid; grid-template-columns: 1.2fr .8fr; gap:14px; }
    @media (max-width: 860px) { header, .repo, .two { display:block; } .repo { min-width:0; margin-top:12px; } .repo button { margin-top:8px; width:100%; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <header>
    <h1>Slipstream Dashboard</h1>
    <div class="repo"><input id="repo" aria-label="Repository path"><button id="refresh">Refresh</button></div>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><div class="label">Readiness</div><div class="value" id="readiness">-</div></div>
      <div class="metric"><div class="label">Open Runs</div><div class="value" id="runs">-</div></div>
      <div class="metric"><div class="label">Slipstream Branches</div><div class="value" id="branches">-</div></div>
      <div class="metric"><div class="label">Open PRs</div><div class="value" id="prs">-</div></div>
    </div>
    <div class="two">
      <section><h2>Production Readiness</h2><table><thead><tr><th style="width:90px">Status</th><th>Check</th><th>Detail</th></tr></thead><tbody id="checks"></tbody></table></section>
      <section><h2>Git</h2><table><tbody id="git"></tbody></table></section>
    </div>
    <section><h2>Runs</h2><table><thead><tr><th style="width:150px">Run</th><th style="width:160px">Status</th><th>Goal</th><th style="width:170px">Updated</th></tr></thead><tbody id="runRows"></tbody></table></section>
    <section><h2>Open Pull Requests</h2><table><thead><tr><th style="width:80px">PR</th><th>Title</th><th style="width:220px">Branch</th></tr></thead><tbody id="prRows"></tbody></table></section>
  </main>
  <script>
    const repoInput = document.getElementById('repo');
    repoInput.value = new URLSearchParams(location.search).get('repo') || ${JSON.stringify(defaultRepo)};
    document.getElementById('refresh').onclick = load;
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    function badge(status) { return '<span class="status '+status+'">'+status.toUpperCase()+'</span>'; }
    function rows(items, empty, render) { return items.length ? items.map(render).join('') : '<tr><td colspan="4" class="muted">'+empty+'</td></tr>'; }
    async function load() {
      const repo = repoInput.value;
      const res = await fetch('/api/status?repo=' + encodeURIComponent(repo));
      const data = await res.json();
      const s = data.check.summary;
      document.getElementById('readiness').textContent = s.fail ? s.fail + ' fail' : (s.warn ? s.warn + ' warn' : 'ready');
      document.getElementById('runs').textContent = data.runs.length;
      document.getElementById('branches').textContent = data.git.slipstreamRefs.length;
      document.getElementById('prs').textContent = data.github.available ? data.github.prs.length : '-';
      document.getElementById('checks').innerHTML = rows(data.check.checks, 'No checks found', c => '<tr><td>'+badge(c.status)+'</td><td>'+esc(c.name)+'</td><td class="muted">'+esc(c.detail || '')+'</td></tr>');
      document.getElementById('git').innerHTML = '<tr><th>Repo</th><td>'+esc(data.repo)+'</td></tr><tr><th>Branch</th><td>'+esc(data.git.branch || '(detached)')+'</td></tr><tr><th>Worktree</th><td>'+esc(data.git.dirty ? 'dirty' : 'clean')+'</td></tr>';
      document.getElementById('runRows').innerHTML = rows(data.runs, 'No Slipstream runs yet', r => '<tr><td>'+esc(r.runStamp)+'</td><td>'+esc(r.status)+'</td><td>'+esc(r.goal)+'</td><td class="muted">'+esc(r.updatedAt || '')+'</td></tr>');
      const prs = data.github.available ? data.github.prs : [];
      document.getElementById('prRows').innerHTML = rows(prs, esc(data.github.error || 'No open PRs'), p => '<tr><td><a href="'+esc(p.url)+'">#'+esc(p.number)+'</a></td><td>'+esc(p.title)+'</td><td class="muted">'+esc(p.headRefName)+' -> '+esc(p.baseRefName)+'</td></tr>');
    }
    load();
  </script>
</body>
</html>`
}

function cmdDashboard(args) {
  const repo = repoRoot(args.repo || args._[0] || process.cwd())
  const host = args.host || '127.0.0.1'
  const port = Number(args.port || DEFAULT_PORT)
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(dashboardHtml(repo))
      return
    }
    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(statusData(url.searchParams.get('repo') || repo), null, 2))
      return
    }
    if (url.pathname === '/api/doctor') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(doctorData(repo), null, 2))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  server.listen(port, host, () => {
    console.log(`Slipstream dashboard: http://${host}:${port}/?repo=${encodeURIComponent(repo)}`)
  })
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage()
    return
  }
  if (args.help || args.h) {
    usage()
    return
  }
  switch (cmd) {
    case 'doctor': cmdDoctor(args); break
    case 'init': cmdInit(args); break
    case 'check': cmdCheck(args); break
    case 'plan': cmdPlan(args); break
    case 'run': cmdRun(args); break
    case 'status': cmdStatus(args); break
    case 'dashboard': cmdDashboard(args); break
    default: die(`unknown command '${cmd}'`)
  }
}

main()
