import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareOptimization } from './performance-analysis.mjs'
import { executeCandidate } from './performance-executor.mjs'
import { normalizeSuiteReports, parseAuditArguments, readJson, writeJson, PERFORMANCE_ARTIFACT_ROOT } from './performance-audit-store.mjs'
import { performanceSourceFingerprint } from './performance-runtime.mjs'

const options = parseAuditArguments(process.argv.slice(2))
if (!options.auditId) throw new Error('用法：pnpm check:performance:verify -- --audit=<编号> --correctness-passed [--user-approved]')
if (!options.correctnessPassed) throw new Error('定向复测前必须先运行相关正确性测试，并传入 --correctness-passed。')

const auditPath = resolve(PERFORMANCE_ARTIFACT_ROOT, options.auditId, 'audit.json')
const audit = await readJson(auditPath)
if (!audit.analysis.candidate) throw new Error('该审计没有可复测候选。')
if (audit.attempts.length >= 2) throw new Error('该候选已经达到两轮优化上限。')
if (audit.analysis.candidate.permission === 'approval-required' && !options.userApproved) throw new Error('该候选属于高风险优化，需要用户确认后传入 --user-approved。')

const attempt = audit.attempts.length + 1
const directory = resolve(PERFORMANCE_ARTIFACT_ROOT, options.auditId, `attempt-${attempt}`)
await mkdir(directory, { recursive: true })
const suite = audit.scope.suites.find((item) => item.id === audit.analysis.candidate.suiteId)
if (!suite) throw new Error(`找不到候选套件：${audit.analysis.candidate.suiteId}`)

const report = await executeCandidate(audit.analysis.candidate, suite, directory)
const afterMetrics = normalizeSuiteReports([suite], { [suite.id]: report })
const beforeMetrics = audit.metrics.filter((item) => item.suiteId === suite.id)
const comparison = compareOptimization(beforeMetrics, afterMetrics, audit.analysis.candidate, attempt)
audit.attempts.push({
  attempt,
  createdAt: new Date().toISOString(),
  correctnessPassed: true,
  sourceFingerprint: performanceSourceFingerprint(
    process.cwd(),
    audit.releaseAudit || audit.allFiles ? null : audit.files,
  ),
  afterMetrics,
  comparison,
})
audit.status = comparison.status
await writeJson(auditPath, audit)
await writeJson(resolve(PERFORMANCE_ARTIFACT_ROOT, options.auditId, 'decision.json'), {
  auditId: audit.id,
  status: comparison.status,
  attempt,
  candidate: audit.analysis.candidate,
  comparison,
})

console.log(`性能优化复测：${comparison.status}`)
console.log(`目标收益：${comparison.improvementPercent?.toFixed(2) ?? '-'}%；门槛：${comparison.requiredImprovementPercent?.toFixed(2) ?? '-'}%。`)
console.log(comparison.reason)
