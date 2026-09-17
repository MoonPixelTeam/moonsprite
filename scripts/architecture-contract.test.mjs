import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { analyzeArchitectureFiles, ARCHITECTURE_RULES, readArchitectureSourceFiles } from './architecture-contract.mjs'
import { architectureAnchorErrors, architectureBudgetErrors, compareProjectVersions, PERMANENT_EXPIRY } from './architecture-budget.mjs'

const fixturePath = fileURLToPath(new URL('./fixtures/architecture-contract/cases.json', import.meta.url))
const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'))

test('worker decode accepts the frame observer but rejects a predecoded document and frame', () => {
  for (const [argumentsSource, expected] of [
    ['data, path, onProgress, true, onDroppedTimelapseFrames', 0],
    ['data, path, onProgress, true, document, frameId', 1],
  ]) {
    const result = analyzeArchitectureFiles({
      'src/renderer/src/core/document-files.ts': `decodeDocumentFileInWorker(${argumentsSource})`,
    })
    assert.equal(result.counts['project-open-secondary-decode'], expected)
  }
})

test('production runtime graph includes shared contracts and has no cross-directory cycles', async () => {
  const files = await readArchitectureSourceFiles()
  assert.ok([...files.keys()].some(file => file.startsWith('src/shared/')))
  const result = analyzeArchitectureFiles(files)
  assert.equal(result.counts['core-runtime-cycle'], 0, JSON.stringify(result.findings.filter(finding => finding.rule === 'core-runtime-cycle')))
})

test('runtime graph ignores explicit and inline type-only imports and reexports', () => {
  for (const statement of ["import type { B } from './b'", "import /* contract */ type { B } from './b'", "import { type B, } from './b'", "export type { B } from './b'", "export { type B } from './b'"]) {
    const result = analyzeArchitectureFiles({
      'src/renderer/src/core/a.ts': statement,
      'src/renderer/src/core/b.ts': "import { A } from './a'",
    })
    assert.equal(result.counts['core-runtime-cycle'], 0, statement)
  }
})

test('runtime graph detects cross-directory imports and shared reexports', () => {
  const result = analyzeArchitectureFiles({
    'src/renderer/src/core/a.ts': "import { type B, value } from '@/locales/b'",
    'src/renderer/src/locales/b.ts': "export { value } from '@shared/c'",
    'src/shared/c.ts': "import { value } from '../renderer/src/core/a'",
  })
  assert.equal(result.counts['core-runtime-cycle'], 3)
})

test('runtime graph keeps side effects and a value named type', () => {
  for (const statement of ["import './b'", "import {} from './b'", "import { type as value } from './b'", "import('./b')"]) {
    const result = analyzeArchitectureFiles({
      'src/renderer/src/core/a.ts': statement,
      'src/renderer/src/core/b.ts': "import './a'",
    })
    assert.equal(result.counts['core-runtime-cycle'], 2, statement)
  }
})

test('valid architecture samples remain clean', () => {
  const result = analyzeArchitectureFiles(fixtures.valid)
  assert.deepEqual(result.counts, Object.fromEntries(Object.keys(ARCHITECTURE_RULES).map((rule) => [rule, 0])))
})
for (const fixture of fixtures.invalid) {
  test(`architecture sample rejects ${fixture.name}`, () => {
    const result = analyzeArchitectureFiles(fixture.files)
    for (const [rule, count] of Object.entries(fixture.expected)) {
      assert.equal(result.counts[rule], count, `${rule} findings`)
    }
  })
}

const zeroBudget = () => ({
  schemaVersion: 1,
  rules: Object.fromEntries(Object.keys(ARCHITECTURE_RULES).map((rule) => [rule, {
    remaining: 0,
    expiresAt: '0.1.0-dev.6',
    target: 'clear',
  }])),
})

const evaluate = (changes = {}) => architectureBudgetErrors({
  budget: changes.budget ?? zeroBudget(),
  counts: changes.counts ?? Object.fromEntries(Object.keys(ARCHITECTURE_RULES).map((rule) => [rule, 0])),
  currentVersion: changes.currentVersion ?? '0.1.0-dev.6',
  knownRuleIds: Object.keys(ARCHITECTURE_RULES),
  previousBudget: changes.previousBudget ?? null,
})

test('architecture budget accepts exact current debt', () => {
  assert.deepEqual(evaluate(), [])
})

test('architecture budget rejects new debt and stale high budget', () => {
  const budget = zeroBudget()
  budget.rules['history-project-snapshot'].remaining = 2
  assert.match(evaluate({ budget, counts: { 'history-project-snapshot': 3 } })[0], /新增了架构债务/)
  assert.match(evaluate({ budget, counts: { 'history-project-snapshot': 1 } })[0], /同步下调/)
})

test('architecture budget cannot increase or postpone its deadline', () => {
  const previousBudget = zeroBudget()
  previousBudget.rules['module-boundary-debt'] = { remaining: 2, expiresAt: '0.1.0-dev.6', target: 'clear' }
  const budget = zeroBudget()
  budget.rules['module-boundary-debt'] = { remaining: 3, expiresAt: '0.1.0-dev.7', target: 'clear' }
  const errors = evaluate({ budget, previousBudget, counts: { 'module-boundary-debt': 3 } })
  assert.ok(errors.some((error) => /不得从 2 回升到 3/.test(error)))
  assert.ok(errors.some((error) => /不得从 0.1.0-dev.6 延后/.test(error)))
})

test('permanent guards must not carry an expired version number', () => {
  const budget = zeroBudget()
  budget.rules['core-runtime-cycle'] = { kind: 'guard', remaining: 0, expiresAt: '0.1.0-dev.6', target: 'clear' }
  assert.match(evaluate({ budget })[0], /expiresAt 必须写成 permanent/)
})

test('migration debt must carry a version deadline instead of permanent', () => {
  const budget = zeroBudget()
  budget.rules['core-runtime-cycle'] = { kind: 'migration', remaining: 0, expiresAt: PERMANENT_EXPIRY, target: 'clear' }
  assert.match(evaluate({ budget })[0], /不能写成 permanent/)
})

test('a guard whose anchor no longer matches must be retired or replaced', () => {
  const budget = zeroBudget()
  budget.rules['core-runtime-cycle'] = { kind: 'guard', remaining: 0, expiresAt: PERMANENT_EXPIRY, target: 'clear', anchor: 'interface WorkspaceState' }
  assert.match(architectureAnchorErrors({ budget, anchorMatches: { 'core-runtime-cycle': false } })[0], /守护锚点/)
  assert.deepEqual(architectureAnchorErrors({ budget, anchorMatches: { 'core-runtime-cycle': true } }), [])
})

test('rules without an anchor stay outside the liveness check', () => {
  assert.deepEqual(architectureAnchorErrors({ budget: zeroBudget(), anchorMatches: {} }), [])
})

test('architecture debt must be zero when its target version arrives', () => {
  const budget = zeroBudget()
  budget.rules['recovery-error-swallow'].remaining = 1
  const errors = evaluate({ budget, counts: { 'recovery-error-swallow': 1 }, currentVersion: '0.1.0-dev.6' })
  assert.ok(errors.some((error) => /已到期/.test(error)))
})

test('project version comparison orders dev releases before formal versions', () => {
  assert.equal(compareProjectVersions('0.1.0-dev.5', '0.1.0-dev.6'), -1)
  assert.equal(compareProjectVersions('0.1.0-dev.6', '0.1.0'), -1)
  assert.equal(compareProjectVersions('0.1.0', '0.1.0'), 0)
})

test('project version comparison understands the beta channel used by package.json', () => {
  assert.equal(compareProjectVersions('1.0.0-beta3', '1.0.0-beta2'), 1)
  assert.equal(compareProjectVersions('1.0.0-beta3', '1.0.0'), -1)
  assert.equal(compareProjectVersions('1.0.0-beta3', '1.1.0'), -1)
  assert.equal(compareProjectVersions('1.0.0', '1.0.0-beta3'), 1)
})
