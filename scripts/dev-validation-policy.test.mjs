import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  classifyDevTier,
  evaluateDevValidationRequest,
  isExplicitDevTestFile,
  isRendererOnlyTypecheckScope,
} from './dev-validation-policy.mjs'

const validationScript = fileURLToPath(new URL('./run-validation.mjs', import.meta.url))

test('拆出的输入、渲染、算法和持久化模块保留 D3 检查', () => {
  for (const file of [
    'components/canvas-render-frame.ts', 'components/app/document-canvas.tsx',
    'core/tools-selection-transform.ts', 'store/workspace-recording.ts',
    'store/workspace-commands-document-io.ts',
  ]) assert.equal(classifyDevTier([`src/renderer/src/${file}`]), 'D3', file)
})

test('dev validation requires an explicit file list', () => {
  const policy = evaluateDevValidationRequest([])
  assert.equal(policy.errors.length, 1)
})

test('normal core and store changes do not require tests', () => {
  const policy = evaluateDevValidationRequest([
    'src/renderer/src/core/tools.ts',
    'src/renderer/src/store/workspace.ts',
  ])
  assert.deepEqual(policy.errors, [])
  assert.deepEqual(policy.explicitTestFiles, [])
  assert.equal(policy.tier, 'D2')
  assert.equal(policy.runTypecheck, true)
})

test('ordinary component changes use the quick D1 path', () => {
  const policy = evaluateDevValidationRequest([
    'src/renderer/src/components/Toolbar.tsx',
    'src/renderer/src/styles.css',
  ])
  assert.equal(policy.tier, 'D1')
  assert.equal(policy.runTypecheck, false)
})

test('canvas, geometry, project IO, recovery, and decode paths use D3 automatically', () => {
  for (const file of [
    'src/renderer/src/components/CanvasStage.tsx',
    'src/renderer/src/components/canvas-selection-renderer.ts',
    'src/renderer/src/components/canvas-composite-cache.ts',
    'src/renderer/src/core/selection.ts',
    'src/renderer/src/core/view-geometry.ts',
    'src/renderer/src/core/canvas-render-plan.ts',
    'src/renderer/src/core/canvas-resize-preview.ts',
    'src/renderer/src/core/project-format.ts',
    'src/renderer/src/core/document-files.ts',
    'src/renderer/src/store/recovery-service.ts',
    'src/renderer/src/workers/document-decode.worker.ts',
    'src/renderer/src/core/history.ts',
    'src/renderer/src/core/storage.ts',
    'src/renderer/src/core/png.ts',
    'src/renderer/src/core/gif.ts',
    'src/renderer/src/core/psd.ts',
    'src/renderer/src/core/aseprite.ts',
    'src/renderer/src/core/bmp.ts',
    'src/renderer/src/store/workspace-history.ts',
    'src/renderer/src/platform/tauri-api.ts',
    'src/renderer/src/workers/project-encode.worker.ts',
  ]) {
    assert.equal(classifyDevTier([file]), 'D3', file)
  }
})

test('shared contracts and sensitive Tauri paths use D3 automatically', () => {
  for (const file of [
    'src/shared/types.ts',
    'src-tauri/src/platform_recovery.rs',
    'src-tauri/src/platform_storage.rs',
    'src-tauri/src/close_coordinator.rs',
  ]) {
    assert.equal(classifyDevTier([file]), 'D3', file)
  }
})

test('automatically classified D3 changes require a targeted test', () => {
  const missingTest = evaluateDevValidationRequest(['src/renderer/src/core/selection.ts'])
  assert.equal(missingTest.tier, 'D3')
  assert.equal(missingTest.runTypecheck, true)
  assert.equal(missingTest.errors.length, 1)

  const withTest = evaluateDevValidationRequest([
    'src/renderer/src/core/selection.ts',
    'src/renderer/src/core/selection.test.ts',
  ])
  assert.deepEqual(withTest.errors, [])
  assert.equal(withTest.tier, 'D3')
})

test('strict mode keeps type checking available for quick-path work', () => {
  assert.equal(classifyDevTier(['src/renderer/src/components/Toolbar.tsx']), 'D1')
  const policy = evaluateDevValidationRequest(
    ['src/renderer/src/components/Toolbar.tsx'],
    { strict: true },
  )
  assert.equal(policy.tier, 'D1')
  assert.equal(policy.runTypecheck, true)
})

test('documentation-only changes stay on D0', () => {
  const policy = evaluateDevValidationRequest(['docs/agent-workflow.md'])
  assert.equal(policy.tier, 'D0')
  assert.equal(policy.runTypecheck, false)
})

test('nested CSS-only changes stay on D0', () => {
  assert.equal(classifyDevTier(['src/renderer/src/styles.css']), 'D0')
})

test('core tests do not get misclassified as presentation work', () => {
  assert.equal(classifyDevTier(['src/renderer/src/core/tools.test.ts']), 'D2')
})

test('test-only changes run the focused test without a redundant typecheck', () => {
  const policy = evaluateDevValidationRequest(['src/renderer/src/core/tools.test.ts'])
  assert.equal(policy.tier, 'D2')
  assert.equal(policy.testOnly, true)
  assert.equal(policy.runTypecheck, false)
  assert.equal(evaluateDevValidationRequest(
    ['src/renderer/src/core/tools.test.ts'],
    { strict: true },
  ).runTypecheck, true)
})

test('high-risk validation requires a targeted test', () => {
  const policy = evaluateDevValidationRequest(
    ['src/renderer/src/core/selection.ts'],
    { highRisk: true },
  )
  assert.equal(policy.errors.length, 1)
})

test('high-risk validation accepts an explicit Vitest file', () => {
  const policy = evaluateDevValidationRequest(
    [
      'src/renderer/src/core/selection.ts',
      'src/renderer/src/core/selection.test.ts',
    ],
    { highRisk: true },
  )
  assert.deepEqual(policy.errors, [])
  assert.deepEqual(policy.explicitTestFiles, ['src/renderer/src/core/selection.test.ts'])
})

test('explicit Node and Vitest tests are recognized', () => {
  assert.equal(isExplicitDevTestFile('scripts/validation-scope.test.mjs'), true)
  assert.equal(isExplicitDevTestFile('src/renderer/src/core/tools.spec.ts'), true)
  assert.equal(isExplicitDevTestFile('src/renderer/src/core/selection-performance.bench.ts'), true)
  assert.equal(isExplicitDevTestFile('src-tauri/tests/recovery.rs'), true)
  assert.equal(isExplicitDevTestFile('src-tauri/thumbnail-provider/tests/provider.rs'), true)
  assert.equal(isExplicitDevTestFile('src/renderer/src/core/tools.ts'), false)
})

test('Rust-only high-risk changes use cargo validation without a synthetic JS test', () => {
  const policy = evaluateDevValidationRequest(['src-tauri/src/platform_recovery.rs'])
  assert.equal(policy.tier, 'D3')
  assert.deepEqual(policy.errors, [])
})

test('renderer typecheck ignores accompanying docs and CSS', () => {
  assert.equal(isRendererOnlyTypecheckScope([
    'src/renderer/src/components/Toolbar.tsx',
    'src/renderer/src/styles.css',
    'docs/agent-workflow.md',
  ]), true)
  assert.equal(isRendererOnlyTypecheckScope([
    'src/renderer/src/components/Toolbar.tsx',
    'src/shared/types.ts',
  ]), false)
  assert.equal(isRendererOnlyTypecheckScope(['package.json']), false)
})

test('dev command fails before validation when no files are provided', () => {
  const result = spawnSync(process.execPath, [validationScript, 'dev'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /必须显式传入本任务文件/)
})

test('dev command rejects high risk without an explicit test', () => {
  const result = spawnSync(process.execPath, [
    validationScript,
    'dev',
    '--risk=high',
    'src/renderer/src/core/selection.ts',
  ], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /必须显式传入至少一个定向测试文件/)
})

test('dev command rejects protected paths without an explicit test', () => {
  const result = spawnSync(process.execPath, [
    validationScript,
    'dev',
    'src/renderer/src/core/project-format.ts',
  ], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /D3 高风险开发检查必须显式传入至少一个定向测试文件/)
})
