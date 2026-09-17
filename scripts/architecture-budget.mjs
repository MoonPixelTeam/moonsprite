import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const ARCHITECTURE_BUDGET_FILE = 'scripts/architecture-debt-budget.json'

// 项目实际使用的版本方案包含 dev / beta 预发布段；旧实现只认 `-dev.N`，
// 遇到带 beta 段的当前版本会直接抛错，使得到期检查在非零债务时崩溃而不是报错。
const RELEASE_STAGES = { dev: 0, beta: 1, rc: 2 }

const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(dev|beta|rc)\.?(\d+))?$/.exec(value)
  if (!match) throw new Error(`不支持的版本格式：${value}`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    stage: match[4] === undefined ? Object.keys(RELEASE_STAGES).length : RELEASE_STAGES[match[4]],
    stageNumber: match[5] === undefined ? 0 : Number(match[5]),
  }
}
export const compareProjectVersions = (left, right) => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch', 'stage', 'stageNumber']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return 0
}

/** 常驻回归护栏没有到期版本；迁移债务必须有到期版本。 */
export const PERMANENT_EXPIRY = 'permanent'

const isVersionString = (value) => {
  if (typeof value !== 'string') return false
  try {
    compareProjectVersions(value, value)
    return true
  } catch {
    return false
  }
}

export const parseArchitectureBudget = (source) => {
  const budget = JSON.parse(source)
  if (budget?.schemaVersion !== 1 || !budget.rules || typeof budget.rules !== 'object') {
    throw new Error('架构债务预算格式无效。')
  }
  return budget
}

export const readArchitectureBudget = async (root = process.cwd()) => (
  parseArchitectureBudget(await readFile(join(root, ARCHITECTURE_BUDGET_FILE), 'utf8'))
)

export const architectureBudgetErrors = ({
  budget,
  counts,
  currentVersion,
  knownRuleIds,
  previousBudget = null,
}) => {
  const errors = []
  const known = new Set(knownRuleIds)

  for (const ruleId of knownRuleIds) {
    const entry = budget.rules[ruleId]
    if (!entry) {
      errors.push(`预算缺少规则 ${ruleId}。`)
      continue
    }
    if (!Number.isInteger(entry.remaining) || entry.remaining < 0) {
      errors.push(`${ruleId} 的 remaining 必须是非负整数。`)
      continue
    }
    if (typeof entry.expiresAt !== 'string' || typeof entry.target !== 'string' || !entry.target.trim()) {
      errors.push(`${ruleId} 必须包含 expiresAt 和 target。`)
      continue
    }
    if (entry.kind !== undefined && entry.kind !== 'guard' && entry.kind !== 'migration') {
      errors.push(`${ruleId} 的 kind 只能是 guard 或 migration。`)
      continue
    }
    if (entry.anchor !== undefined && (typeof entry.anchor !== 'string' || !entry.anchor.trim())) {
      errors.push(`${ruleId} 的 anchor 必须是非空正则字符串。`)
      continue
    }

    // 常驻护栏不挂版本号，迁移债务必须有到期版本；否则会出现“早已过期却仍在绿灯”的假账。
    const permanent = entry.expiresAt === PERMANENT_EXPIRY
    if (entry.kind === 'guard' && !permanent) {
      errors.push(`${ruleId} 是常驻护栏 guard，expiresAt 必须写成 ${PERMANENT_EXPIRY}，不能挂一个早已过期的版本号。`)
    }
    if (entry.kind === 'migration' && permanent) {
      errors.push(`${ruleId} 是迁移债务 migration，必须给出到期版本，不能写成 ${PERMANENT_EXPIRY}。`)
    } else if (!permanent && !isVersionString(entry.expiresAt)) {
      errors.push(`${ruleId} 的 expiresAt 必须是 X.Y.Z 版本或 ${PERMANENT_EXPIRY}。`)
    }

    const actual = counts[ruleId] ?? 0
    if (actual > entry.remaining) {
      errors.push(`${ruleId} 新增了架构债务：实际 ${actual}，预算 ${entry.remaining}。`)
    } else if (actual < entry.remaining) {
      errors.push(`${ruleId} 已降至 ${actual}，必须把预算从 ${entry.remaining} 同步下调，避免留下虚高额度。`)
    }

    if (entry.remaining > 0 && !permanent && compareProjectVersions(currentVersion, entry.expiresAt) >= 0) {
      errors.push(`${ruleId} 的 ${entry.remaining} 项迁移债务已到期（${entry.expiresAt}），必须清零。`)
    }

    const previous = previousBudget?.rules?.[ruleId]
    if (previous) {
      if (entry.remaining > previous.remaining) {
        errors.push(`${ruleId} 的预算不得从 ${previous.remaining} 回升到 ${entry.remaining}。`)
      }
      if (!permanent && previous.expiresAt !== PERMANENT_EXPIRY && compareProjectVersions(entry.expiresAt, previous.expiresAt) > 0) {
        errors.push(`${ruleId} 的到期版本不得从 ${previous.expiresAt} 延后到 ${entry.expiresAt}。`)
      }
    }
  }

  for (const ruleId of Object.keys(budget.rules)) {
    if (!known.has(ruleId)) errors.push(`预算包含未知规则 ${ruleId}。`)
  }

  return errors
}

/**
 * 规则失效自检：命中面为 0 的护栏等于永久绿灯。
 * 规则可声明 anchor（正则）；若该正则在真实生产源码的路径或内容中已无命中，
 * 说明规则守护的代码形态已经消失，规则不可能再触发，必须退役或替换。
 */
export const architectureAnchorErrors = ({ budget, anchorMatches = {} }) => {
  const errors = []
  for (const [ruleId, entry] of Object.entries(budget?.rules ?? {})) {
    if (typeof entry?.anchor !== 'string' || !entry.anchor.trim()) continue
    if (anchorMatches[ruleId] === true) continue
    errors.push(`规则 ${ruleId} 的守护锚点 /${entry.anchor}/ 在生产源码中已无命中：该规则不可能再触发，必须退役或替换为等价护栏。`)
  }
  return errors
}
