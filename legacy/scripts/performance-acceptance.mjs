const acceptedOutcomes = new Set(['adopted', 'not-adopted', 'approved-no-change'])
const performanceLevelRank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 }

export function validateAcceptance(audit, { outcome, reason, userApproved, sourceFingerprint }) {
  const errors = []
  const latestAttempt = audit.attempts.at(-1)
  if (!acceptedOutcomes.has(outcome)) errors.push('结果必须是 adopted、not-adopted 或 approved-no-change。')
  if (!reason?.trim()) errors.push('接受性能审计时必须记录原因。')
  if (outcome === 'adopted' && latestAttempt?.comparison?.status !== 'accepted') errors.push('adopted 需要最近一次定向复测已经接受。')
  if (outcome === 'not-adopted' && (!latestAttempt || latestAttempt.comparison?.accepted)) errors.push('not-adopted 需要至少一次未接受的定向复测。')
  if (outcome === 'approved-no-change' && !userApproved) errors.push('approved-no-change 需要明确的用户批准标记。')
  const expectedFingerprint = outcome === 'adopted' ? latestAttempt?.sourceFingerprint : audit.sourceFingerprint
  if (sourceFingerprint && expectedFingerprint?.value !== sourceFingerprint.value) {
    errors.push(outcome === 'adopted'
      ? '当前性能相关源码与最后一次已接受复测不一致，必须重新复测。'
      : '当前性能相关源码与初始审计不一致，必须恢复未采纳改动或重新审计。')
  }
  return errors
}

export function mergeAcceptedMetrics(audit, outcome) {
  if (outcome !== 'adopted') return audit.metrics
  const replacements = new Map(audit.attempts.at(-1).afterMetrics.map((item) => [item.id, item]))
  const merged = audit.metrics.map((item) => replacements.get(item.id) ?? item)
  for (const item of replacements.values()) if (!merged.some((candidate) => candidate.id === item.id)) merged.push(item)
  return merged
}

const outcomeLabels = {
  adopted: '已采纳优化',
  'not-adopted': '优化未采纳',
  'approved-no-change': '用户批准不改代码',
}

export function performanceHistoryEntry({ audit, outcome, reason, acceptedAt }) {
  const candidate = audit.analysis.candidate
  const comparison = audit.attempts.at(-1)?.comparison
  const date = acceptedAt.slice(0, 10)
  return [
    `## ${date} ${audit.releaseLabel} 自动性能审计`,
    '',
    `审计编号：\`${audit.id}\`。性能等级为 ${audit.scope.level}，结果为“${outcomeLabels[outcome]}”。${reason}`,
    '',
    candidate ? `候选热点：${candidate.label}；初始值 ${candidate.value.toFixed(3)}，测量噪声 ${candidate.noisePercent.toFixed(2)}%。` : '现有自动基准没有覆盖可比较候选。',
    comparison ? `定向复测收益 ${comparison.improvementPercent.toFixed(2)}%，接受门槛 ${comparison.requiredImprovementPercent.toFixed(2)}%；${comparison.reason}` : '本次没有执行代码复测。',
    `执行套件：${audit.scope.suites.map((suite) => suite.id).join('、')}。`,
    '',
  ].join('\n')
}

export function insertPerformanceHistory(history, entry) {
  const existingAuditId = entry.match(/审计编号：`([^`]+)`/)?.[1]
  if (existingAuditId && history.includes(`审计编号：\`${existingAuditId}\``)) return history
  const match = history.match(/^## \d{4}-\d{2}-\d{2}/m)
  if (!match || match.index === undefined) return `${history.trimEnd()}\n\n${entry}`
  return `${history.slice(0, match.index).trimEnd()}\n\n${entry}\n${history.slice(match.index)}`
}

export function buildAcceptedPerformanceState({ audit, outcome, reason, acceptedAt, environment, sourceFingerprint, history }) {
  const metrics = mergeAcceptedMetrics(audit, outcome)
  const baseline = {
    schemaVersion: 1,
    acceptedAt,
    releaseLabel: audit.releaseLabel,
    auditId: audit.id,
    environment,
    sourceFingerprint,
    metrics,
  }
  const receipt = {
    schemaVersion: 1,
    status: 'complete',
    releaseLabel: audit.releaseLabel,
    auditId: audit.id,
    outcome,
    acceptedAt,
    scopeLevel: audit.scope.level,
    releaseAudit: audit.releaseAudit === true || audit.allFiles === true,
    sourceFingerprint,
  }
  return {
    baseline,
    receipt,
    history: insertPerformanceHistory(history, performanceHistoryEntry({ audit, outcome, reason, acceptedAt })),
  }
}

export function validatePerformanceReceipt(receipt, { releaseLabel, sourceFingerprint, minimumLevel = 'P3' }) {
  const errors = []
  if (receipt?.status === 'legacy') {
    if (receipt.releaseLabel !== releaseLabel) errors.push(`历史性能凭证属于 ${receipt?.releaseLabel ?? '未知版本'}，当前目标是 ${releaseLabel}。`)
    return errors
  }
  if (receipt?.schemaVersion !== 1) errors.push('缺少有效的性能发布凭证。')
  if (receipt?.status !== 'complete') errors.push('当前版本的性能审计尚未完成。')
  if (receipt?.releaseLabel !== releaseLabel) errors.push(`性能凭证属于 ${receipt?.releaseLabel ?? '未知版本'}，当前目标是 ${releaseLabel}。`)
  if (!acceptedOutcomes.has(receipt?.outcome)) errors.push('性能凭证缺少有效的审计结果。')
  if (!receipt?.auditId) errors.push('性能凭证缺少审计编号。')
  if (receipt?.releaseAudit !== true) errors.push('性能发布凭证必须来自发布审计或显式 --all 审计。')
  if (!Object.hasOwn(performanceLevelRank, receipt?.scopeLevel)) {
    errors.push('性能发布凭证缺少有效的性能等级。')
  } else if (!Object.hasOwn(performanceLevelRank, minimumLevel) || performanceLevelRank[receipt.scopeLevel] < performanceLevelRank[minimumLevel]) {
    errors.push(`性能发布凭证等级必须至少为 ${minimumLevel}。`)
  }
  if (receipt?.sourceFingerprint?.value !== sourceFingerprint.value) errors.push('性能审计后性能相关源码发生了变化，需要重新审计。')
  return errors
}
