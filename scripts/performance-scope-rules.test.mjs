import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPerformanceAudit, classifyPerformanceImpact } from './performance-scope-rules.mjs'

test('文档和测试属于 P0', () => {
  assert.equal(classifyPerformanceImpact(['docs/testing/performance-baseline.md', 'src/core/example.test.ts']).level, 'P0')
  assert.equal(classifyPerformanceImpact(['src/renderer/src/core/example.spec.ts']).level, 'P0')
})

test('普通 UI、交互热点和高频渲染分别归入 P1、P2、P3', () => {
  assert.equal(classifyPerformanceImpact(['src/renderer/src/components/AboutDialog.tsx']).level, 'P1')
  const input = classifyPerformanceImpact(['src/renderer/src/core/canvas-input.ts'])
  assert.equal(input.level, 'P2')
  assert.equal(input.suites[0].id, 'canvas-interaction')
  assert.deepEqual(input.commands, ['pnpm bench:canvas -- --size=512 --scenario=pan,zoom --runtime=production'])
  assert.equal(classifyPerformanceImpact(['src/renderer/src/components/CanvasStage.tsx']).level, 'P3')

  const targeted = classifyPerformanceImpact(['src/renderer/src/components/CanvasStage.tsx'])
  assert.deepEqual(targeted.suites.map((suite) => suite.id), [
    'canvas-targeted',
    'canvas-large-sentinel',
  ])
  assert.deepEqual(targeted.suites[0].sizes, [1024])
  assert.deepEqual(targeted.suites[0].scenarios, ['pan', 'zoom', 'draw'])
  assert.deepEqual(targeted.suites[1].sizes, [2048])
  assert.deepEqual(targeted.suites[1].scenarios, ['large-detail-pan', 'large-detail-draw'])
  assert.equal(targeted.suites.some((suite) => suite.sizes?.includes(4000)), false)

  const adjustments = classifyPerformanceImpact(['src/renderer/src/core/adjustments.ts'])
  assert.equal(adjustments.level, 'P2')
  assert.deepEqual(adjustments.suites.map((suite) => suite.id), ['adjustments'])
})

test('性能 Harness 脚本和 benchmark 文件至少进入 P3，并选择可执行套件', () => {
  for (const file of [
    'scripts/canvas-performance-options.mjs',
    'scripts/canvas-performance.mjs',
    'scripts/performance-executor.mjs',
  ]) {
    const script = classifyPerformanceAudit([file])
    assert.equal(script.level, 'P3', file)
    assert.deepEqual(script.suites.map((suite) => suite.id), ['canvas-targeted', 'canvas-large-sentinel'], file)
  }

  const benchmark = classifyPerformanceAudit(['src/renderer/src/core/selection-performance.bench.ts'])
  assert.equal(benchmark.level, 'P3')
  assert.deepEqual(benchmark.suites.map((suite) => suite.id), ['selection'])

  const testScript = classifyPerformanceAudit(['scripts/performance-analysis.test.mjs'])
  assert.equal(testScript.level, 'P0')
  assert.deepEqual(testScript.suites, [])
})

test('Vitest 配置只运行轻量算法 benchmark，不触发浏览器 Canvas 套件', () => {
  const config = classifyPerformanceAudit(['vitest.config.ts'])
  assert.equal(config.level, 'P3')
  assert.deepEqual(config.suites.map((suite) => suite.id), ['selection'])
  assert.deepEqual(config.commands, ['pnpm exec vitest bench src/renderer/src/core/selection-performance.bench.ts --run'])

  const mixed = classifyPerformanceAudit([
    'vitest.config.ts',
    'src/renderer/src/core/selection.ts',
  ])
  assert.equal(mixed.suites.filter((suite) => suite.id === 'selection').length, 1)
})

test('报告、分析和凭证脚本保持快速路径，不触发性能矩阵', () => {
  for (const file of [
    'scripts/performance-analysis.mjs',
    'scripts/performance-acceptance.mjs',
    'scripts/performance-audit-store.mjs',
    'scripts/performance-runtime.mjs',
    'scripts/performance-scope-rules.mjs',
    'scripts/run-performance-audit.mjs',
    'scripts/verify-performance-optimization.mjs',
    'scripts/accept-performance-audit.mjs',
    'scripts/check-performance-release.mjs',
  ]) {
    const audit = classifyPerformanceAudit([file])
    assert.equal(audit.level, 'P0', file)
    assert.deepEqual(audit.suites, [], file)
  }
})

test('性能注入与 Profiler 入口的定向 P3 包含轻量 profile 套件', () => {
  for (const file of [
    'src/renderer/src/main.tsx',
    'src/renderer/src/components/PerformanceProfiler.tsx',
    'src/renderer/src/performance/benchmark-harness.ts',
    'src/renderer/src/performance/benchmark-plan.ts',
  ]) {
    const audit = classifyPerformanceAudit([file])
    assert.equal(audit.level, 'P3', file)
    assert.equal(audit.suites.some((suite) => suite.id === 'canvas-targeted'), false, file)
    assert.equal(audit.suites.some((suite) => suite.id === 'canvas-large-sentinel'), false, file)
    const profile = audit.suites.find((suite) => suite.id === 'canvas-profile-targeted')
    assert.deepEqual(profile?.sizes, [1024], file)
    assert.deepEqual(profile?.scenarios, ['zoom', 'draw'], file)
    assert.equal(profile?.runtime, 'profile', file)
  }

  const release = classifyPerformanceAudit(
    ['src/renderer/src/performance/benchmark-harness.ts'],
    { releaseAudit: true, minimumLevel: 'P3' },
  )
  assert.equal(release.suites.some((suite) => suite.id === 'canvas-profile'), true)
  assert.equal(release.suites.some((suite) => suite.id === 'canvas-profile-targeted'), false)
})

test('依赖与构建配置归入 P4 并覆盖其他级别', () => {
  const result = classifyPerformanceImpact(['src/renderer/src/components/CanvasStage.tsx', 'pnpm-lock.yaml'])
  assert.equal(result.level, 'P4')
  assert.deepEqual(result.suites.map((suite) => suite.id), ['canvas-standard', 'canvas-profile', 'canvas-complex', 'canvas-large-800', 'canvas-large-2048', 'canvas-large-4000', 'canvas-large-sentinel', 'selection', 'adjustments', 'document-composite', 'project-format', 'bundle', 'desktop'])
  assert.deepEqual(result.suites.find((suite) => suite.id === 'canvas-complex').sizes, [800, 1024])
  assert.equal(result.suites.find((suite) => suite.id === 'canvas-profile').runtime, 'profile')
})

test('仅修改 package 脚本不被误判为依赖升级', () => {
  assert.equal(classifyPerformanceImpact(['package.json']).level, 'P1')
})

test('显式 --all 才允许完整性能套件并固定为 P4', () => {
  const result = classifyPerformanceAudit(['docs/product/behavior.md'], { all: true })
  assert.equal(result.level, 'P4')
  assert.equal(result.suites.some((suite) => suite.id === 'desktop'), true)
})

test('发布审计至少运行 P3 并固定覆盖标准、Profiler、大画布和 1024 复杂工程', () => {
  const ordinaryRelease = classifyPerformanceAudit(['src/renderer/src/components/AboutDialog.tsx'], { minimumLevel: 'P3', releaseAudit: true })
  assert.equal(ordinaryRelease.level, 'P3')
  assert.deepEqual(ordinaryRelease.suites.map((suite) => suite.id), ['canvas-standard', 'canvas-profile', 'canvas-large-800', 'canvas-large-2048', 'canvas-large-4000', 'canvas-large-sentinel', 'canvas-complex', 'project-format', 'bundle'])
  assert.deepEqual(ordinaryRelease.suites[0].scenarios, ['pan', 'zoom', 'rotated-zoom', 'draw', 'shape', 'marquee', 'bucket-fill', 'gradient'])
  assert.deepEqual(ordinaryRelease.suites.find((suite) => suite.id === 'canvas-large-4000').scenarios, ['large-pan', 'large-zoom', 'large-draw', 'large-shape', 'large-marquee', 'large-bucket-fill', 'large-selection-fill', 'large-selection-delete', 'large-layer-visibility', 'large-group-visibility', 'large-layer-opacity', 'large-layer-reorder', 'large-layer-style-move', 'large-layer-style-shadow-size', 'large-layer-style-inner-glow-size', 'large-gradient', 'large-detail-pan', 'large-detail-draw', 'large-detail-draw-timelapse'])
  const complexSuite = ordinaryRelease.suites.find((suite) => suite.id === 'canvas-complex')
  assert.deepEqual(complexSuite.sizes, [1024])
  assert.deepEqual(complexSuite.scenarios, ['complex-draw', 'complex-undo', 'complex-playback'])
  assert.equal(complexSuite.repetitions, 3)

  const animationRelease = classifyPerformanceAudit(['src/renderer/src/core/animation.ts'], { minimumLevel: 'P3', releaseAudit: true })
  assert.deepEqual(animationRelease.suites.map((suite) => suite.id), ['canvas-standard', 'canvas-profile', 'canvas-large-800', 'canvas-large-2048', 'canvas-large-4000', 'canvas-large-sentinel', 'canvas-complex', 'document-composite', 'project-format', 'bundle'])

  const projectFormatAudit = classifyPerformanceAudit(['src/renderer/src/core/project-format.ts'])
  assert.equal(projectFormatAudit.level, 'P3')
  assert.deepEqual(projectFormatAudit.suites.map((suite) => suite.id), ['project-format'])

  const projectFormatRelease = classifyPerformanceAudit(['src/renderer/src/core/project-format.ts'], { minimumLevel: 'P3', releaseAudit: true })
  assert.deepEqual(projectFormatRelease.suites.map((suite) => suite.id), ['canvas-standard', 'canvas-profile', 'canvas-large-800', 'canvas-large-2048', 'canvas-large-4000', 'canvas-large-sentinel', 'canvas-complex', 'project-format', 'bundle'])
})

test('定向 P3 对复杂工程保留一个代表场景，完整复杂矩阵只在发布审计运行', () => {
  const targeted = classifyPerformanceAudit(['src/renderer/src/core/animation.ts'])
  assert.deepEqual(targeted.suites.map((suite) => suite.id), [
    'canvas-complex-targeted',
    'document-composite',
  ])
  assert.deepEqual(targeted.suites.find((suite) => suite.id === 'canvas-complex-targeted').scenarios, ['complex-draw'])

  const release = classifyPerformanceAudit(['src/renderer/src/core/animation.ts'], { releaseAudit: true, minimumLevel: 'P3' })
  assert.equal(release.suites.some((suite) => suite.id === 'canvas-complex'), true)
  assert.equal(release.suites.some((suite) => suite.id === 'canvas-complex-targeted'), false)
})
