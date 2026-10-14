import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAcceptedPerformanceState,
  insertPerformanceHistory,
  validateAcceptance,
  validatePerformanceReceipt,
} from './performance-acceptance.mjs'

const candidate = { id: 'metric', suiteId: 'canvas', label: 'Canvas draw', value: 10, noisePercent: 1 }
const initialFingerprint = { algorithm: 'sha256', value: 'initial', files: 10 }
const fingerprint = { algorithm: 'sha256', value: 'abc', files: 10 }
const audit = {
  id: 'audit-1', releaseLabel: 'DEV.3', metrics: [candidate],
  scope: { level: 'P3', suites: [{ id: 'canvas-full' }] },
  analysis: { candidate },
  releaseAudit: true,
  sourceFingerprint: initialFingerprint,
  attempts: [{ sourceFingerprint: fingerprint, afterMetrics: [{ ...candidate, value: 9 }], comparison: { status: 'accepted', accepted: true, improvementPercent: 10, requiredImprovementPercent: 5, reason: 'accepted' } }],
}

test('接受结果必须符合复测状态或显式用户批准', () => {
  assert.deepEqual(validateAcceptance(audit, { outcome: 'adopted', reason: '收益稳定', userApproved: false, sourceFingerprint: fingerprint }), [])
  assert.match(validateAcceptance({ ...audit, attempts: [] }, { outcome: 'adopted', reason: 'x' })[0], /定向复测/)
  assert.match(validateAcceptance(audit, { outcome: 'approved-no-change', reason: '高风险' })[0], /用户批准/)
  assert.match(validateAcceptance(audit, { outcome: 'adopted', reason: 'x', sourceFingerprint: initialFingerprint })[0], /重新复测/)
  assert.match(validateAcceptance({ ...audit, attempts: [{ ...audit.attempts[0], comparison: { status: 'rejected-final', accepted: false } }] }, { outcome: 'not-adopted', reason: 'x', sourceFingerprint: fingerprint })[0], /恢复未采纳改动/)
})

test('显式接受生成基线、发布凭证和唯一历史条目', () => {
  const result = buildAcceptedPerformanceState({
    audit,
    outcome: 'adopted',
    reason: '收益稳定。',
    acceptedAt: '2026-08-08T00:00:00.000Z',
    environment: { platform: 'win32' },
    sourceFingerprint: fingerprint,
    history: '# 性能更新记录\n\n## 记录规则\n\n规则。\n\n## 2026-08-07 旧记录\n',
  })
  assert.equal(result.baseline.metrics[0].value, 9)
  assert.equal(result.receipt.status, 'complete')
  assert.equal(result.receipt.scopeLevel, 'P3')
  assert.equal(result.receipt.releaseAudit, true)
  assert.match(result.history, /DEV\.3 自动性能审计/)
  assert.equal(insertPerformanceHistory(result.history, result.history.match(/## 2026-08-08[\s\S]*?(?=## 2026-08-07)/)[0]), result.history)
})

test('发布凭证必须匹配当前版本和源码指纹', () => {
  const receipt = { schemaVersion: 1, status: 'complete', releaseLabel: 'DEV.3', auditId: 'audit-1', outcome: 'not-adopted', scopeLevel: 'P3', releaseAudit: true, sourceFingerprint: fingerprint }
  assert.deepEqual(validatePerformanceReceipt(receipt, { releaseLabel: 'DEV.3', sourceFingerprint: fingerprint }), [])
  assert.match(validatePerformanceReceipt(receipt, { releaseLabel: 'DEV.4', sourceFingerprint: fingerprint })[0], /DEV\.3/)
  assert.match(validatePerformanceReceipt(receipt, { releaseLabel: 'DEV.3', sourceFingerprint: { ...fingerprint, value: 'changed' } }).at(-1), /重新审计/)
  assert.match(validatePerformanceReceipt({ ...receipt, releaseAudit: false }, { releaseLabel: 'DEV.3', sourceFingerprint: fingerprint })[0], /发布审计/)
  assert.match(validatePerformanceReceipt({ ...receipt, scopeLevel: 'P1' }, { releaseLabel: 'DEV.3', sourceFingerprint: fingerprint })[0], /至少为 P3/)
})

test('已发布的历史版本允许在机制启用前通过，不伪造性能结果', () => {
  const legacy = { schemaVersion: 1, status: 'legacy', releaseLabel: 'DEV.3', enforcedFrom: 'DEV.4' }
  assert.deepEqual(validatePerformanceReceipt(legacy, { releaseLabel: 'DEV.3', sourceFingerprint: fingerprint }), [])
  assert.match(validatePerformanceReceipt(legacy, { releaseLabel: 'DEV.4', sourceFingerprint: fingerprint })[0], /历史性能凭证/)
})
