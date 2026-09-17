import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DOC_PAIR_BUDGET_FILE = 'scripts/doc-pair-budget.json'

const SKIP_DIRECTORIES = new Set(['node_modules', 'target', 'dist', '.git', 'out', 'release', 'artifacts', '.planning', 'coverage'])

export const headingSignature = (source) => {
  const counts = {}
  for (const line of source.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+\S/.exec(line)
    if (match) counts[match[1].length] = (counts[match[1].length] ?? 0) + 1
  }
  return counts
}

const basename = (file) => file.split('/').pop()

/**
 * 中英文档配对检查。英文副本是人工维护的镜像，内容不会自己跟上正本，
 * 所以这里用章节结构做代理指标：正本加了章节而副本没跟，就会被发现。
 * 尚未同步的配对登记在 doc-pair-budget.json 的 pendingParity 里，只能逐项清偿。
 */
export const docPairErrors = ({ pairs, budget }) => {
  const errors = []
  const pending = budget?.pendingParity ?? {}
  for (const pair of pairs) {
    const { mirror, base, mirrorSource, baseSource } = pair
    if (baseSource === null) {
      errors.push(`${mirror} 没有对应的正本 ${base}。`)
      continue
    }
    if (!baseSource.includes(basename(mirror))) {
      errors.push(`${base} 没有链接到英文副本 ${basename(mirror)}。`)
    }
    if (!mirrorSource.includes(basename(base))) {
      errors.push(`${mirror} 没有链接回正本 ${basename(base)}。`)
    }
    if (pending[mirror]) continue
    const baseSignature = headingSignature(baseSource)
    const mirrorSignature = headingSignature(mirrorSource)
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const expected = baseSignature[level] ?? 0
      const actual = mirrorSignature[level] ?? 0
      if (actual !== expected) {
        errors.push(`${mirror} 的 H${level} 标题数与正本不一致：正本 ${expected}，副本 ${actual}。${level <= 2 ? '请同步章节，或登记进 doc-pair-budget.json 的 pendingParity。' : ''}`)
      }
    }
  }

  const known = new Set(pairs.map((pair) => pair.mirror))
  for (const file of Object.keys(pending)) {
    if (!known.has(file)) errors.push(`doc-pair-budget.json 登记的 ${file} 已不存在，必须删除该条目。`)
  }

  return errors
}

const discoverMirrors = async (root) => {
  const mirrors = []
  const walk = async (directory) => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const child = directory === '.' ? entry.name : `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        await walk(child)
      } else if (entry.name.endsWith('.en.md')) {
        mirrors.push(child)
      }
    }
  }
  await walk('.')
  return mirrors.sort()
}

export const collectDocPairs = async (root = process.cwd()) => {
  const mirrors = await discoverMirrors(root)
  const pairs = []
  for (const mirror of mirrors) {
    const base = mirror.replace(/\.en\.md$/, '.md')
    let baseSource = null
    try {
      baseSource = await readFile(join(root, base), 'utf8')
    } catch {
      baseSource = null
    }
    pairs.push({ mirror, base, mirrorSource: await readFile(join(root, mirror), 'utf8'), baseSource })
  }
  return pairs
}

export const runDocPairCheck = async (root = process.cwd()) => {
  const budget = JSON.parse(await readFile(join(root, DOC_PAIR_BUDGET_FILE), 'utf8'))
  const pairs = await collectDocPairs(root)
  const errors = docPairErrors({ pairs, budget })
  const pending = Object.keys(budget.pendingParity ?? {})

  if (errors.length > 0) {
    console.error('中英文档配对检查失败：')
    for (const error of errors) console.error(`- ${error}`)
    return { errors, pairs, pending }
  }

  console.log(`中英文档配对检查通过：${pairs.length} 对镜像，章节结构与互链一致；待同步 ${pending.length} 个${pending.length > 0 ? `（${pending.join('、')}）` : ''}。`)
  return { errors: [], pairs, pending }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runDocPairCheck(process.cwd())
  if (result.errors.length > 0) process.exitCode = 1
}
