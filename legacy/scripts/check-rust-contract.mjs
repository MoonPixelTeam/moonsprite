import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RUST_RISK_BUDGET_FILE = 'scripts/rust-risk-budget.json'

export const RUST_RISK_ROOTS = ['src-tauri/src', 'src-tauri/thumbnail-provider/src']

/**
 * 零容忍只作用于应用平台层。thumbnail-provider 里的手工检查程序是开发工具，
 * 读到位图异常时应当大声失败，不能用“返回可展示错误”的要求去约束它。
 */
const ZERO_TOLERANCE_ROOTS = ['src-tauri/src/']

const FORBIDDEN_PATTERN = /\b(?:panic!|todo!|unimplemented!|unreachable!)/g

export const countRustRisks = (source) => {
  const count = (pattern) => (source.match(pattern) ?? []).length
  return {
    panic: count(/\.unwrap\(\)/g) + count(/\.expect\(/g),
    silent: count(/let\s+_\s*=/g),
    unsafe: count(/\bunsafe\b/g),
    forbidden: count(FORBIDDEN_PATTERN),
  }
}

/**
 * Rust 侧风险额度：登记的是“允许存在的数量”，只能下降不能上升。
 * 额度为 0 的未登记文件一旦出现计数就失败，这样新增债务必须显式登记。
 */
export const rustRiskErrors = ({ budget, sources }) => {
  const errors = []
  const registered = budget.files ?? {}

  for (const [file, counts] of Object.entries(sources)) {
    for (const key of ['panic', 'silent', 'unsafe']) {
      const actual = counts[key]
      const allowed = registered[file]?.[key] ?? 0
      if (actual > allowed) {
        errors.push(`${file} 的 ${key} 计数从 ${allowed} 上升到 ${actual}：Rust 风险额度只能下降，新文件请先在 ${RUST_RISK_BUDGET_FILE} 登记。`)
      }
    }
    if (counts.forbidden > 0 && ZERO_TOLERANCE_ROOTS.some((root) => file.startsWith(root))) {
      errors.push(`${file} 出现 ${counts.forbidden} 处 panic!/todo!/unimplemented!/unreachable!：平台层零容忍，请改为返回可展示错误。`)
    }
  }

  for (const file of Object.keys(registered)) {
    if (!(file in sources)) {
      errors.push(`${file} 已不在 Rust 扫描范围内，必须从 ${RUST_RISK_BUDGET_FILE} 删除该条目。`)
    }
  }

  return errors
}

export const collectRustSources = async (root = process.cwd()) => {
  const sources = {}
  const walk = async (directory) => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const child = `${directory}/${entry.name}`
      if (entry.isDirectory()) await walk(child)
      else if (entry.name.endsWith('.rs')) sources[child] = countRustRisks(await readFile(join(root, child), 'utf8'))
    }
  }
  for (const directory of RUST_RISK_ROOTS) {
    try {
      await walk(directory)
    } catch {
      continue
    }
  }
  return sources
}

export const runRustRiskCheck = async (root = process.cwd()) => {
  const budget = JSON.parse(await readFile(join(root, RUST_RISK_BUDGET_FILE), 'utf8'))
  const sources = await collectRustSources(root)
  const errors = rustRiskErrors({ budget, sources })

  if (errors.length > 0) {
    console.error('Rust 风险检查失败：')
    for (const error of errors) console.error(`- ${error}`)
    return { errors, sources }
  }

  const total = Object.values(sources).reduce((sum, counts) => sum + counts.panic, 0)
  const allowed = Object.values(budget.files ?? {}).reduce((sum, entry) => sum + (entry.panic ?? 0), 0)
  const drift = allowed > total ? `，登记额度 ${allowed} 已高于实际 ${total}，建议同步下调` : ''
  console.log(`Rust 风险检查通过：${Object.keys(sources).length} 个文件，panic 风险 ${total}/${allowed}，未登记文件无新增计数，平台层无 panic!/todo!${drift}。`)
  return { errors: [], sources }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runRustRiskCheck(process.cwd())
  if (result.errors.length > 0) process.exitCode = 1
}
