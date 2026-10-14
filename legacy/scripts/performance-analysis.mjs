const CANVAS_BUDGETS = {
  frameP95: 16.7,
  over25Percent: 1,
  drawP95: 4,
  inputP95: 4,
  reactCommitP95: 16.7,
  reactRegionP95: 8,
}

const BENCHMARK_BUDGETS = [
  [/4000x4000 brightness/i, 140],
  [/4000x4000 curves/i, 160],
  [/4000x4000 hue saturation/i, 180],
  [/4000x4000 color balance/i, 180],
  [/4000x4000 curve histogram/i, 160],
  [/1024x1024 high entropy hue saturation/i, 160],
  [/1024x1024 high entropy color balance/i, 100],
  [/contiguous noise background/i, 22],
  [/selection boundary/i, 12],
  [/64x64 dirty region/i, 100],
  [/800x800 with 24 grouped layers/i, 1000],
]

export function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function noisePercent(values) {
  const center = median(values)
  if (center <= 0 || values.length < 2) return 0
  return median(values.map((value) => Math.abs(value - center))) / center * 100
}

const metric = ({ id, suiteId, kind, label, values, budget, target }) => ({
  id,
  suiteId,
  kind,
  label,
  value: median(values),
  samples: values.length,
  noisePercent: noisePercent(values),
  budget,
  target,
})

export function normalizeCanvasResults(rawResults, suiteId, options = {}) {
  const groups = new Map()
  for (const result of rawResults ?? []) {
    const key = `${result.canvasSize}:${result.scenario}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(result)
  }

  const metrics = []
  for (const [key, results] of groups) {
    const [sizeText, scenario] = key.split(':')
    const canvasSize = Number(sizeText)
    const target = { kind: 'canvas', suiteId, canvasSize, scenario }
    const metricDefinitions = options.reactOnly
      ? [['reactCommitP95', 'React 提交 p95']]
      : [
          ['p95', '帧 p95'],
          ['over25Percent', '>25 ms 比例'],
          ['drawP95', '主绘制 p95'],
          ['inputP95', '指针处理 p95'],
        ]
    for (const [name, label] of metricDefinitions) {
      const values = results.map((result) => Number(result[name])).filter(Number.isFinite)
      if (values.length === 0) continue
      const budgetKey = name === 'p95' ? 'frameP95' : name
      metrics.push(metric({
        id: `${suiteId}:${canvasSize}:${scenario}:${name}`,
        suiteId,
        kind: name === 'reactCommitP95' ? 'react-root' : 'canvas',
        label: `${canvasSize}x${canvasSize} ${scenario} ${label}`,
        values,
        budget: CANVAS_BUDGETS[budgetKey],
        target: { ...target, metric: name },
      }))
    }

    const regions = options.reactOnly ? new Set(results.flatMap((result) => Object.keys(result.reactByRegion ?? {}))) : new Set()
    for (const region of regions) {
      const values = results.map((result) => Number(result.reactByRegion?.[region]?.p95)).filter(Number.isFinite)
      if (values.length === 0) continue
      metrics.push(metric({
        id: `${suiteId}:${canvasSize}:${scenario}:react-region:${region}`,
        suiteId,
        kind: 'react-region',
        label: `${canvasSize}x${canvasSize} ${scenario} React ${region}`,
        values,
        budget: CANVAS_BUDGETS.reactRegionP95,
        target: { ...target, metric: 'reactRegionP95', region },
      }))
    }
  }
  return metrics
}

const benchmarkBudget = (name) => BENCHMARK_BUDGETS.find(([pattern]) => pattern.test(name))?.[1] ?? 100

export function normalizeVitestBenchmark(report, suiteId) {
  const metrics = []
  for (const file of report?.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        const value = Number(benchmark.median ?? benchmark.mean)
        if (!Number.isFinite(value)) continue
        const name = benchmark.name ?? benchmark.id
        metrics.push({
          id: `${suiteId}:${benchmark.id}`,
          suiteId,
          kind: 'algorithm',
          label: `${group.fullName} > ${name}`,
          value,
          samples: Number(benchmark.sampleCount ?? benchmark.samples?.length ?? 1),
          noisePercent: Math.abs(Number(benchmark.rme ?? 0)),
          budget: benchmarkBudget(name),
          target: { kind: 'vitest-benchmark', suiteId, benchmarkId: benchmark.id },
        })
      }
    }
  }
  return metrics
}

export function normalizeBundleReport(report, suiteId = 'bundle') {
  return (report?.chunks ?? []).filter((chunk) => chunk.file.endsWith('.js')).map((chunk) => ({
    id: `${suiteId}:${chunk.file}:gzipBytes`,
    suiteId,
    kind: 'bundle',
    label: `${chunk.file} gzip`,
    value: Number(chunk.gzipBytes),
    samples: 1,
    noisePercent: 0,
    budget: 300 * 1024,
    target: { kind: 'bundle', suiteId, file: chunk.file, metric: 'gzipBytes' },
  })).filter((item) => Number.isFinite(item.value))
}

export function environmentsMatch(left, right) {
  if (!left || !right) return false
  return ['platform', 'arch', 'cpu', 'logicalCpuCount', 'totalMemoryBytes', 'gpu', 'powerPlan', 'node', 'browser'].every((key) => left[key] === right[key])
}

const severityRank = { stable: 0, attention: 1, blocking: 2 }

const hasStableHistorySample = (item) => !['canvas', 'react-root', 'react-region'].includes(item.kind) || item.samples >= 3

export function analyzePerformance(metrics, baseline = null, environment = null, options = {}) {
  const comparable = environmentsMatch(environment, baseline?.environment)
  const baselineById = new Map((baseline?.metrics ?? []).map((item) => [item.id, item]))
  const analyzed = metrics.filter((item) => Number.isFinite(item.value) && item.value >= 0).map((item) => {
    const previous = comparable ? baselineById.get(item.id) : null
    const historicalComparable = Boolean(previous?.value > 0 && hasStableHistorySample(item) && hasStableHistorySample(previous))
    const deltaPercent = historicalComparable ? (item.value - previous.value) / previous.value * 100 : null
    const budgetDeltaPercent = item.budget > 0 ? (item.value - item.budget) / item.budget * 100 : null
    const severity = (deltaPercent !== null && deltaPercent > 15) || (budgetDeltaPercent !== null && budgetDeltaPercent > 15)
      ? 'blocking'
      : (deltaPercent !== null && deltaPercent > 5) || (budgetDeltaPercent !== null && budgetDeltaPercent > 5)
        ? 'attention'
        : 'stable'
    const budgetRatio = item.budget > 0 ? item.value / item.budget : 0
    const regressionWeight = deltaPercent === null ? 1 : 1 + Math.max(0, deltaPercent) / 100
    return { ...item, baselineValue: previous?.value ?? null, historicalComparable, deltaPercent, budgetDeltaPercent, severity, score: budgetRatio * regressionWeight }
  })
  analyzed.sort((left, right) => right.score - left.score || right.value - left.value || left.id.localeCompare(right.id))
  const candidate = analyzed.find((item) => item.id === options.candidateId) ?? analyzed[0] ?? null
  const overallSeverity = analyzed.reduce((result, item) => severityRank[item.severity] > severityRank[result] ? item.severity : result, 'stable')
  const permission = candidate?.kind === 'react-region' && !['MoonSprite', 'CanvasStage'].includes(candidate.target.region)
    ? 'auto-low-risk'
    : 'approval-required'
  const recommendation = candidate?.kind === 'react-region'
    ? '检查该区域的订阅选择器、对象引用稳定性和 memo 边界，保持输出与事件顺序不变。'
    : candidate?.kind === 'bundle'
      ? '先检查重复入口、动态加载边界和资源重复打包，不为减少 chunk 数量牺牲首屏或打开工程时间。'
      : candidate?.kind === 'algorithm'
        ? '先用固定输入定位循环、分配和缓存命中差异；像素结果必须逐项保持一致。'
        : '先定位对应场景的高频调用和重复计算；涉及像素、坐标、撤销或共享状态时必须等待用户确认。'
  return { comparable, severity: overallSeverity, metrics: analyzed, candidate: candidate ? { ...candidate, permission, recommendation } : null }
}

export function compareOptimization(beforeMetrics, afterMetrics, candidate, attempt = 1) {
  const before = beforeMetrics.find((item) => item.id === candidate.id)
  const after = afterMetrics.find((item) => item.id === candidate.id)
  if (!before || !after || before.value <= 0) {
    return { status: attempt >= 2 ? 'rejected-final' : 'retry', accepted: false, reason: '候选指标缺少可比较的前后样本。' }
  }

  const improvementPercent = (before.value - after.value) / before.value * 100
  const requiredImprovementPercent = Math.max(5, 2 * before.noisePercent, 2 * after.noisePercent)
  const afterById = new Map(afterMetrics.map((item) => [item.id, item]))
  const sameMeasurementContext = (item) => candidate.target?.kind !== 'canvas'
    || (item.target?.kind === 'canvas'
      && item.target.canvasSize === candidate.target.canvasSize
      && item.target.scenario === candidate.target.scenario)
  const adjacentRegressions = beforeMetrics.filter((item) => item.suiteId === candidate.suiteId && item.id !== candidate.id && sameMeasurementContext(item)).flatMap((item) => {
    const next = afterById.get(item.id)
    if (!next || item.value <= 0) return []
    const regression = (next.value - item.value) / item.value * 100
    const threshold = Math.max(5, 2 * item.noisePercent, 2 * next.noisePercent)
    return regression > threshold ? [{ id: item.id, regressionPercent: regression, thresholdPercent: threshold }] : []
  })
  const accepted = improvementPercent > requiredImprovementPercent && adjacentRegressions.length === 0
  return {
    status: accepted ? 'accepted' : attempt >= 2 ? 'rejected-final' : 'retry',
    accepted,
    improvementPercent,
    requiredImprovementPercent,
    adjacentRegressions,
    reason: accepted
      ? '目标收益超过噪声门槛，且相邻指标没有稳定退化。'
      : adjacentRegressions.length > 0
        ? '相邻指标出现稳定退化。'
        : '目标收益没有超过测量噪声门槛。',
  }
}
