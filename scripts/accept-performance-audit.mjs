import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildAcceptedPerformanceState, validateAcceptance } from './performance-acceptance.mjs'
import {
  PERFORMANCE_ARTIFACT_ROOT,
  PERFORMANCE_BASELINE_PATH,
  PERFORMANCE_RECEIPT_PATH,
  parseAuditArguments,
  readJson,
  writeJson,
} from './performance-audit-store.mjs'
import { currentReleaseLabel, performanceEnvironment, performanceSourceFingerprint } from './performance-runtime.mjs'

const options = parseAuditArguments(process.argv.slice(2))
if (!options.auditId) throw new Error('用法：pnpm check:performance:accept -- --audit=<编号> --outcome=<结果> --reason=<原因>')
const auditPath = resolve(PERFORMANCE_ARTIFACT_ROOT, options.auditId, 'audit.json')
const audit = await readJson(auditPath)
if (audit.releaseLabel !== currentReleaseLabel()) throw new Error('审计版本与当前发布目标不一致。')
if (!(audit.releaseAudit === true || audit.allFiles === true) || (audit.scope?.level !== 'P3' && audit.scope?.level !== 'P4')) {
  throw new Error('只有发布审计或显式 --all 的 P3/P4 结果才能生成发布性能凭证；普通定向审计无需执行 accept。')
}
const sourceFingerprint = performanceSourceFingerprint(
  process.cwd(),
  audit.releaseAudit || audit.allFiles ? null : audit.files,
)
const errors = validateAcceptance(audit, { ...options, sourceFingerprint })
if (errors.length > 0) throw new Error(errors.join('\n'))

const acceptedAt = new Date().toISOString()
const historyPath = 'docs/testing/performance-history.md'
const history = await readFile(historyPath, 'utf8')
const accepted = buildAcceptedPerformanceState({
  audit,
  outcome: options.outcome,
  reason: options.reason,
  acceptedAt,
  environment: performanceEnvironment(),
  sourceFingerprint,
  history,
})

await writeJson(PERFORMANCE_BASELINE_PATH, accepted.baseline)
await writeJson(PERFORMANCE_RECEIPT_PATH, accepted.receipt)
await writeFile(historyPath, accepted.history, 'utf8')
audit.status = 'complete'
audit.acceptance = { outcome: options.outcome, reason: options.reason, acceptedAt, sourceFingerprint }
await writeJson(auditPath, audit)
console.log(`性能审计 ${audit.id} 已接受：${options.outcome}。`)
