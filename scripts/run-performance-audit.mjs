import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { analyzePerformance } from './performance-analysis.mjs'
import { classifyPerformanceAudit } from './performance-scope-rules.mjs'
import { confirmCanvasCandidate, executePerformanceSuites } from './performance-executor.mjs'
import {
  PERFORMANCE_ARTIFACT_ROOT,
  PERFORMANCE_BASELINE_PATH,
  normalizeSuiteReports,
  parseAuditArguments,
  performanceReportMarkdown,
  readOptionalJson,
  resolvePerformanceAuditFiles,
  writeJson,
} from './performance-audit-store.mjs'
import { currentReleaseLabel, performanceEnvironment, performanceSourceFingerprint, repositoryFiles } from './performance-runtime.mjs'

const options = parseAuditArguments(process.argv.slice(2))
let files
try {
  files = resolvePerformanceAuditFiles(options, repositoryFiles)
} catch (error) {
  console.error(`性能审计未运行：${error.message}`)
  process.exit(1)
}
const scope = classifyPerformanceAudit(files, {
  minimumLevel: options.release ? 'P3' : 'P0',
  releaseAudit: options.release,
  all: options.all,
})
if (scope.suites.length === 0) {
  console.log(`性能审计跳过：${scope.level} 范围没有自动性能套件，请运行对应的脚本测试。`)
  process.exit(0)
}
const id = `${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}_${randomUUID().slice(0, 8)}`
const directory = resolve(PERFORMANCE_ARTIFACT_ROOT, id)
await mkdir(directory, { recursive: true })

const environment = performanceEnvironment()
const sourceFingerprint = performanceSourceFingerprint(
  process.cwd(),
  options.release || options.all ? null : files,
)
const baseline = await readOptionalJson(PERFORMANCE_BASELINE_PATH)
const reports = await executePerformanceSuites(scope.suites, directory)
let metrics = normalizeSuiteReports(scope.suites, reports)
let analysis = analyzePerformance(metrics, baseline, environment)

if (analysis.candidate?.target.kind === 'canvas') {
  const candidateId = analysis.candidate.id
  const suite = scope.suites.find((item) => item.id === analysis.candidate.suiteId)
  reports[suite.id] = await confirmCanvasCandidate(suite, analysis.candidate, directory, reports[suite.id])
  metrics = normalizeSuiteReports(scope.suites, reports)
  analysis = analyzePerformance(metrics, baseline, environment, { candidateId })
}

const audit = {
  schemaVersion: 1,
  id,
  createdAt: new Date().toISOString(),
  releaseLabel: currentReleaseLabel(),
  releaseAudit: options.release,
  allFiles: options.all,
  ci: options.ci,
  files,
  scope,
  environment,
  sourceFingerprint,
  metrics,
  analysis,
  attempts: [],
  status: analysis.candidate ? analysis.candidate.permission === 'auto-low-risk' ? 'candidate-ready' : 'approval-required' : 'uncovered',
}

await writeJson(resolve(directory, 'audit.json'), audit)
await writeJson(resolve(directory, 'decision.json'), {
  auditId: id,
  status: audit.status,
  severity: analysis.severity,
  candidate: analysis.candidate,
})
await writeFile(resolve(directory, 'report.md'), performanceReportMarkdown(audit), 'utf8')

console.log(`性能审计编号：${id}`)
console.log(`性能等级：${scope.level}`)
console.log(`报告：${resolve(directory, 'report.md')}`)
if (!analysis.candidate) console.log('没有自动基准覆盖的候选，发布前需要人工确认。')
else console.log(`优化候选：${analysis.candidate.label}；权限：${analysis.candidate.permission}`)
