import { validatePerformanceReceipt } from './performance-acceptance.mjs'
import { PERFORMANCE_RECEIPT_PATH, readOptionalJson } from './performance-audit-store.mjs'
import { currentReleaseLabel, performanceSourceFingerprint } from './performance-runtime.mjs'

const receipt = await readOptionalJson(PERFORMANCE_RECEIPT_PATH)
const releaseLabel = currentReleaseLabel()
const sourceFingerprint = performanceSourceFingerprint()
const errors = validatePerformanceReceipt(receipt, { releaseLabel, sourceFingerprint })
if (errors.length > 0) {
  console.error('性能发布门禁未通过：')
  for (const error of errors) console.error(`- ${error}`)
  console.error('先完成性能审计、最多两轮优化尝试和显式接受，再重新运行发布检查。')
  process.exit(1)
}
if (receipt.status === 'legacy') console.log(`性能发布门禁通过：${releaseLabel} 为机制启用前的历史版本，${receipt.enforcedFrom} 起强制执行性能审计。`)
else console.log(`性能发布门禁通过：${releaseLabel}，审计 ${receipt.auditId}，结果 ${receipt.outcome}。`)
