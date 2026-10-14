import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzePerformance,
  compareOptimization,
  environmentsMatch,
  median,
  noisePercent,
  normalizeBundleReport,
  normalizeCanvasResults,
  normalizeVitestBenchmark,
} from './performance-analysis.mjs'

const environment = { platform: 'win32', arch: 'x64', cpu: 'test-cpu', node: 'v22', browser: 'test-browser' }

test('中位数与噪声不受单个最长异常值支配', () => {
  assert.equal(median([10, 10, 100]), 10)
  assert.equal(noisePercent([10, 10, 100]), 0)
})

test('Canvas 结果归一化重复样本并在 profiling 报告保留 React 区域', () => {
  const samples = [
    { canvasSize: 512, scenario: 'draw', p95: 4, over25Percent: 0, drawP95: 1, inputP95: 0.5, reactCommitP95: 12, reactByRegion: { LayersPanel: { p95: 9 } } },
    { canvasSize: 512, scenario: 'draw', p95: 4.2, over25Percent: 0, drawP95: 1.2, inputP95: 0.5, reactCommitP95: 13, reactByRegion: { LayersPanel: { p95: 10 } } },
    { canvasSize: 512, scenario: 'draw', p95: 40, over25Percent: 1, drawP95: 1.1, inputP95: 0.6, reactCommitP95: 12.5, reactByRegion: { LayersPanel: { p95: 9.5 } } },
  ]
  const metrics = normalizeCanvasResults(samples, 'canvas-standard')
  const profiling = normalizeCanvasResults(samples, 'canvas-profile', { reactOnly: true })
  assert.equal(metrics.find((item) => item.id.endsWith(':p95')).value, 4.2)
  assert.equal(profiling.find((item) => item.kind === 'react-region').target.region, 'LayersPanel')
})

test('生产 Canvas 与 profiling Canvas 使用互不混合的指标', () => {
  const sample = { canvasSize: 1024, scenario: 'draw', p95: 7, over25Percent: 0, drawP95: 2, inputP95: 1, reactCommitP95: 9, reactByRegion: { LayersPanel: { p95: 6 } } }
  const production = normalizeCanvasResults([sample], 'canvas-production')
  const profiling = normalizeCanvasResults([sample, sample, sample], 'canvas-profile', { reactOnly: true })
  assert.equal(production.some((item) => item.kind.startsWith('react')), false)
  assert.equal(profiling.every((item) => item.kind.startsWith('react')), true)
  assert.equal(profiling.find((item) => item.kind === 'react-root').samples, 3)
})

test('Vitest 与包体积报告归一化为统一指标', () => {
  const vitest = normalizeVitestBenchmark({ files: [{ groups: [{ fullName: 'group', benchmarks: [{ id: 'bench-1', name: 'select contiguous noise background', median: 18, rme: 3, sampleCount: 20 }] }] }] }, 'selection')
  const adjustment = normalizeVitestBenchmark({ files: [{ groups: [{ fullName: 'adjustments', benchmarks: [{ id: 'adjustment-1', name: 'adjust 4000x4000 hue saturation', median: 145, rme: 2, sampleCount: 10 }] }] }] }, 'adjustments')
  assert.equal(vitest[0].budget, 22)
  assert.equal(vitest[0].noisePercent, 3)
  assert.equal(adjustment[0].budget, 180)
  assert.equal(normalizeBundleReport({ chunks: [{ file: 'index.js', gzipBytes: 1000 }, { file: 'style.css', gzipBytes: 500 }] }).length, 1)
})

test('环境不一致时不声明历史退化，但仍选择当前热点', () => {
  const metrics = [{ id: 'a', suiteId: 'canvas', kind: 'canvas', label: 'A', value: 12, samples: 3, noisePercent: 1, budget: 10, target: { kind: 'canvas' } }]
  const baseline = { environment: { ...environment, cpu: 'other' }, metrics: [{ ...metrics[0], value: 5 }] }
  const result = analyzePerformance(metrics, baseline, environment)
  assert.equal(environmentsMatch(environment, baseline.environment), false)
  assert.equal(result.comparable, false)
  assert.equal(result.candidate.id, 'a')
  assert.equal(result.candidate.deltaPercent, null)
})

test('5% 与 15% 阈值分别标记关注和阻断', () => {
  const metrics = [
    { id: 'attention', suiteId: 's', kind: 'canvas', label: 'attention', value: 106, samples: 3, noisePercent: 1, budget: 100, target: { kind: 'canvas' } },
    { id: 'blocking', suiteId: 's', kind: 'canvas', label: 'blocking', value: 116, samples: 3, noisePercent: 1, budget: 100, target: { kind: 'canvas' } },
  ]
  const baseline = { environment, metrics: metrics.map((item) => ({ ...item, value: 100 })) }
  const result = analyzePerformance(metrics, baseline, environment)
  assert.equal(result.metrics.find((item) => item.id === 'attention').severity, 'attention')
  assert.equal(result.metrics.find((item) => item.id === 'blocking').severity, 'blocking')
  assert.equal(result.severity, 'blocking')
})

test('Canvas 单次样本不声明历史退化，但候选补齐三次后可以比较', () => {
  const single = { id: 'canvas', suiteId: 's', kind: 'canvas', label: 'canvas', value: 120, samples: 1, noisePercent: 0, budget: 200, target: { kind: 'canvas' } }
  const baseline = { environment, metrics: [{ ...single, value: 100, samples: 3 }] }
  const first = analyzePerformance([single], baseline, environment)
  assert.equal(first.metrics[0].historicalComparable, false)
  assert.equal(first.metrics[0].deltaPercent, null)

  const confirmed = analyzePerformance([{ ...single, samples: 3 }], baseline, environment)
  assert.equal(confirmed.metrics[0].historicalComparable, true)
  assert.equal(confirmed.metrics[0].deltaPercent, 20)
})

test('Canvas 候选补样后保持锁定，不被其他单次指标替换', () => {
  const metrics = [
    { id: 'confirmed', suiteId: 's', kind: 'canvas', label: 'confirmed', value: 8, samples: 3, noisePercent: 1, budget: 16.7, target: { kind: 'canvas' } },
    { id: 'single', suiteId: 's', kind: 'canvas', label: 'single', value: 15, samples: 1, noisePercent: 0, budget: 16.7, target: { kind: 'canvas' } },
  ]
  assert.equal(analyzePerformance(metrics, null, environment, { candidateId: 'confirmed' }).candidate.id, 'confirmed')
})

test('正常结果仍选一个候选且仅具体 React 区域允许低风险自动化', () => {
  const metrics = [
    { id: 'frame', suiteId: 's', kind: 'canvas', label: 'frame', value: 5, samples: 3, noisePercent: 1, budget: 16.7, target: { kind: 'canvas' } },
    { id: 'panel', suiteId: 's', kind: 'react-region', label: 'panel', value: 7, samples: 3, noisePercent: 1, budget: 8, target: { kind: 'canvas', region: 'LayersPanel' } },
  ]
  const result = analyzePerformance(metrics, null, environment)
  assert.equal(result.candidate.id, 'panel')
  assert.equal(result.candidate.permission, 'auto-low-risk')
  assert.match(result.candidate.recommendation, /订阅选择器/)
})

test('优化必须超过噪声且不能让相邻指标退化', () => {
  const before = [
    { id: 'target', suiteId: 's', value: 100, noisePercent: 2 },
    { id: 'adjacent', suiteId: 's', value: 50, noisePercent: 1 },
  ]
  const candidate = { id: 'target', suiteId: 's' }
  assert.equal(compareOptimization(before, [{ ...before[0], value: 90 }, before[1]], candidate).accepted, true)
  assert.equal(compareOptimization(before, [{ ...before[0], value: 98 }, before[1]], candidate).status, 'retry')
  const regressed = compareOptimization(before, [{ ...before[0], value: 90 }, { ...before[1], value: 60 }], candidate, 2)
  assert.equal(regressed.accepted, false)
  assert.equal(regressed.status, 'rejected-final')
})

test('Canvas 相邻指标限定为同一尺寸和场景', () => {
  const target = { id: 'draw:p95', suiteId: 'canvas', value: 100, noisePercent: 1, target: { kind: 'canvas', canvasSize: 1024, scenario: 'draw' } }
  const sameScenario = { id: 'draw:input', suiteId: 'canvas', value: 20, noisePercent: 1, target: { kind: 'canvas', canvasSize: 1024, scenario: 'draw' } }
  const otherScenario = { id: 'pan:p95', suiteId: 'canvas', value: 20, noisePercent: 1, target: { kind: 'canvas', canvasSize: 1024, scenario: 'pan' } }
  const candidate = { ...target }
  const comparison = compareOptimization(
    [target, sameScenario, otherScenario],
    [{ ...target, value: 90 }, sameScenario, { ...otherScenario, value: 40 }],
    candidate,
  )
  assert.equal(comparison.accepted, true)
  const sameScenarioRegression = compareOptimization(
    [target, sameScenario, otherScenario],
    [{ ...target, value: 90 }, { ...sameScenario, value: 30 }, otherScenario],
    candidate,
  )
  assert.equal(sameScenarioRegression.accepted, false)
})
