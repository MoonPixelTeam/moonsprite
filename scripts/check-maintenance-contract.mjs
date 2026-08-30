import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'AGENTS.md',
  'CHANGELOG.md',
  'docs/README.md',
  'docs/agent-workflow.md',
  'docs/product/behavior.md',
  'docs/architecture/overview.md',
  'docs/architecture/state-history.md',
  'docs/architecture/coordinates-rendering.md',
  'docs/architecture/localization.md',
  'docs/interactions/pointer-modifiers.md',
  'docs/interactions/selection-transform.md',
  'docs/interactions/brush-color.md',
  'docs/interactions/workspace-docking.md',
  'docs/testing/regression-matrix.md',
  'docs/testing/performance-baseline.md',
  'docs/testing/performance-history.md',
  'docs/testing/performance-baseline-data.json',
  'docs/testing/performance-release-receipt.json',
  'docs/changelog/README.md',
  'docs/release/changelog-policy.md',
  'docs/release/development-cycle.md',
  'docs/release/release-checklist.md',
  'docs/adr/README.md',
  'docs/templates/feature-spec.md',
  'docs/templates/bug-regression.md',
  '.github/workflows/ci.yml',
  '.github/workflows/performance.yml',
  '.github/pull_request_template.md',
  'scripts/check-changelog-update.mjs',
  'scripts/check-version-contract.mjs',
  'scripts/csp-policy.mjs',
  'scripts/csp-policy.test.mjs',
  'scripts/check-module-boundaries.mjs',
  'scripts/module-boundaries.test.mjs',
  'scripts/architecture-budget.mjs',
  'scripts/architecture-contract.mjs',
  'scripts/architecture-contract.test.mjs',
  'scripts/architecture-debt-budget.json',
  'scripts/fixtures/architecture-contract/cases.json',
  'scripts/version-contract.test.mjs',
  'scripts/validation-scope.mjs',
  'scripts/validation-scope.test.mjs',
  'scripts/run-validation.mjs',
  'scripts/ci-scope.mjs',
  'scripts/performance-analysis.mjs',
  'scripts/performance-audit-store.mjs',
  'scripts/performance-audit-store.test.mjs',
  'scripts/performance-executor.mjs',
  'scripts/performance-acceptance.mjs',
  'scripts/performance-runtime.mjs',
  'scripts/run-performance-audit.mjs',
  'scripts/verify-performance-optimization.mjs',
  'scripts/accept-performance-audit.mjs',
  'scripts/check-performance-release.mjs',
]

const missing = []
for (const relativePath of requiredFiles) {
  try {
    await access(join(root, relativePath))
  } catch {
    missing.push(relativePath)
  }
}

if (missing.length > 0) {
  console.error('维护契约缺少必要文件：')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

const overviewPath = join(root, 'docs/architecture/overview.md')
const overview = await readFile(overviewPath, 'utf8')
const architectureBudget = JSON.parse(await readFile(join(root, 'scripts/architecture-debt-budget.json'), 'utf8'))
const statusMatch = overview.match(/^- 计划状态：(已完成|进行中|暂停)$/m)
const remainingMatch = overview.match(/^- 未完成高风险拆分项：(\d+)$/m)
const contentErrors = []

if (!statusMatch) {
  contentErrors.push('docs/architecture/overview.md 缺少有效的“计划状态”字段。')
}

if (!remainingMatch) {
  contentErrors.push('docs/architecture/overview.md 缺少“未完成高风险拆分项”数量。')
}

if (statusMatch && remainingMatch) {
  const status = statusMatch[1]
  const remaining = Number(remainingMatch[1])
  const budgetRemaining = Object.values(architectureBudget.rules ?? {}).filter((entry) => Number(entry.remaining) > 0).length
  if (status === '已完成' && remaining !== 0) {
    contentErrors.push('计划状态为“已完成”时，未完成高风险拆分项必须为 0。')
  }
  if (status === '进行中' && remaining === 0) {
    contentErrors.push('计划状态为“进行中”时，必须登记至少 1 个未完成高风险拆分项。')
  }
  if (remaining !== budgetRemaining) {
    contentErrors.push(`未完成高风险拆分项应与非零架构债务类别一致：文档 ${remaining}，预算 ${budgetRemaining}。`)
  }
}

const stalePhrases = ['五个原高风险入口已完成第一轮渐进拆分']
for (const phrase of stalePhrases) {
  if (overview.includes(phrase)) {
    contentErrors.push(`docs/architecture/overview.md 仍包含过期状态描述：“${phrase}”。`)
  }
}

if (contentErrors.length > 0) {
  console.error('维护契约内容与当前状态不一致：')
  for (const error of contentErrors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `维护契约检查通过：${requiredFiles.length} 个文件存在，架构计划状态为“${statusMatch[1]}”，未完成高风险拆分项 ${remainingMatch[1]} 个。`,
)
