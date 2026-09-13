import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScanner, SyntaxKind } from 'typescript/unstable/ast'
import {
  architectureAnchorErrors,
  architectureBudgetErrors,
  ARCHITECTURE_BUDGET_FILE,
  parseArchitectureBudget,
  readArchitectureBudget,
} from './architecture-budget.mjs'
import { moduleBoundaryFindings } from './check-module-boundaries.mjs'

const RENDERER_ROOT = 'src/renderer/src'
const COMPONENT_ROOT = `${RENDERER_ROOT}/components/`
const CORE_ROOT = `${RENDERER_ROOT}/core/`
const STORE_ROOT = `${RENDERER_ROOT}/store/`

export const ARCHITECTURE_RULES = {
  'component-domain-write': '组件直接修改文档或会话派生状态',
  'history-project-snapshot': '撤销历史使用工程编解码快照',
  'project-open-secondary-decode': '一次工程打开执行第二次完整解码',
  'async-project-main-thread-preparation': '异步工程任务在 Worker 前完整同步准备',
  'recovery-error-swallow': '恢复路径静默吞掉错误',
  'core-runtime-cycle': 'core 生产运行时循环依赖文件',
  'module-boundary-debt': '既有模块边界迁移债务',
  'permanent-boundary-allowlist': '按文件永久边界白名单或忽略指令',
  'render-key-pixel-serialization': '渲染键序列化像素或整份文档',
}

const normalize = (file) => file.replaceAll('\\', '/')
const isProductionSource = (file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(?:test|spec|bench)\.[cm]?[jt]sx?$/.test(file) && !file.endsWith('.d.ts')

const lineAt = (source, index) => source.slice(0, index).split(/\r?\n/).length

const finding = (rule, file, source, index, message, column = null) => ({
  rule,
  file,
  line: lineAt(source, index),
  ...(column === null ? {} : { column }),
  message,
})

const scannerTokens = (source) => {
  const scanner = createScanner(true, undefined, source)
  const tokens = []
  let previousEnd = -1
  while (true) {
    const kind = scanner.scan()
    const end = scanner.getTokenEnd()
    if (end <= previousEnd) break
    const token = { kind, value: scanner.getTokenValue(), pos: scanner.getTokenStart(), end }
    tokens.push(token)
    previousEnd = end
    if (kind === SyntaxKind.EndOfFile) break
  }
  return tokens
}

const componentDomainWriteFindings = (file, source) => {
  const isReactSurface = file.endsWith('.tsx') || /\/use[A-Z][A-Za-z0-9_$]*\.ts$/.test(file)
  if (!file.startsWith(COMPONENT_ROOT) || !isReactSurface || !isProductionSource(file)) return []
  const results = []
  const lines = source.split(/\r?\n/)
  let offset = 0
  const assignment = /\b(?:delete\s+)?((?:(?:[A-Za-z_$][\w$]*)\.)*(?:document\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|(?:layer|group|cel|mask)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|[A-Za-z_$][\w$]*\.(?:dirty|updatedAt|revision|[A-Za-z_$][\w$]*(?:Revision|Invalidation|CacheVersion)|recoverySuppressed))|(?:session|active|currentSession|liveSession)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:\+\+|--|\?\?=|\|\|=|&&=|[+\-*/%&|^]?=(?!=|>))/g
  for (const line of lines) {
    const rawMutator = /\.mutateActive\s*\(/g
    for (const match of line.matchAll(rawMutator)) {
      results.push(finding('component-domain-write', file, source, offset + match.index, '组件不得调用原始 mutateActive；请使用领域命令或事务。', match.index + 1))
    }
    const rawHistory = /(?:\.pushHistory|\.history\.(?:beginCompound|endCompound|push|undo|redo))\s*\(/g
    for (const match of line.matchAll(rawHistory)) {
      results.push(finding('component-domain-write', file, source, offset + match.index, '组件不得直接创建或控制文档历史；请提交领域命令或事务。', match.index + 1))
    }
    for (const match of line.matchAll(assignment)) {
      if (match[1].includes('document.documentElement')) continue
      results.push(finding('component-domain-write', file, source, offset + match.index, `组件直接写入 ${match[1]}。`, match.index + 1))
    }
    offset += line.length + 1
  }
  return results
}

const historySnapshotFindings = (file, source) => {
  if (!file.startsWith(STORE_ROOT) || !isProductionSource(file)) return []
  const results = []
  for (const match of source.matchAll(/\bencodeProject\s*\(/g)) {
    results.push(finding('history-project-snapshot', file, source, match.index, 'Store 不得用 encodeProject 创建撤销快照。'))
  }
  for (const match of source.matchAll(/\bdecodeProject\s*\(/g)) {
    const context = source.slice(Math.max(0, match.index - 100), Math.min(source.length, match.index + 180))
    if (/readRecovery\s*\(/.test(context)) continue
    results.push(finding('history-project-snapshot', file, source, match.index, 'Store 不得用 decodeProject 恢复撤销快照。'))
  }
  return results
}

const splitTopLevelArguments = (source, openParen) => {
  const argumentsList = []
  let depth = 0
  let start = openParen + 1
  let quote = null
  let escaped = false
  for (let index = openParen + 1; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' && depth === 0) {
      argumentsList.push(source.slice(start, index).trim())
      return argumentsList.filter(Boolean)
    } else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 0) {
      argumentsList.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  return []
}

const secondaryDecodeFindings = (file, source) => {
  if (!file.startsWith(RENDERER_ROOT) || !isProductionSource(file)) return []
  const results = []
  for (const match of source.matchAll(/\bdecodeDocumentFileInWorker\s*\(/g)) {
    const openParen = source.indexOf('(', match.index)
    const args = splitTopLevelArguments(source, openParen)
    if (args.length < 5) continue
    results.push(finding('project-open-secondary-decode', file, source, match.index, '已解码工程不得再次把原始归档送入完整解码 Worker。'))
  }
  return results
}

const functionBlocks = (source) => {
  const blocks = []
  const pattern = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b[^\n{]*\{([\s\S]*?)^\}/gm
  for (const match of source.matchAll(pattern)) {
    const bodyOffset = match[0].indexOf(match[2])
    blocks.push({ name: match[1], start: match.index + bodyOffset, end: match.index + bodyOffset + match[2].length })
  }
  return blocks
}

const asyncPreparationFindings = (file, source) => {
  if ((!file.startsWith(CORE_ROOT) && !file.startsWith(STORE_ROOT)) || !isProductionSource(file)) return []
  const results = []
  for (const block of functionBlocks(source)) {
    if (!/Async$/.test(block.name)) continue
    const body = source.slice(block.start, block.end)
    const awaitMatch = /\bawait\b/.exec(body)
    const syncPrefix = awaitMatch ? body.slice(0, awaitMatch.index) : body
    for (const match of syncPrefix.matchAll(/\b(?:createProjectArchiveFiles|encodeProjectPreview|compositeDocument)\s*\(/g)) {
      results.push(finding('async-project-main-thread-preparation', file, source, block.start + match.index, `${block.name} 在第一次异步让出前执行完整工程准备。`))
    }
  }
  return results
}

const recoverySwallowFindings = (file, source) => {
  if (!/recovery/i.test(file) || !isProductionSource(file)) return []
  const results = []
  for (const match of source.matchAll(/\bcatch(?:\s*\([^)]*\))?\s*\{([\s\S]*?)\}/g)) {
    const body = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\r\n]*/g, '')
      .replace(/[;\s]/g, '')
    if (body) continue
    results.push(finding('recovery-error-swallow', file, source, match.index, '恢复路径不得用空 catch 静默吞掉错误。'))
  }
  for (const match of source.matchAll(/\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\{([\s\S]*?)\}\s*\)/g)) {
    const body = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\r\n]*/g, '')
      .replace(/[;\s]/g, '')
    if (body) continue
    results.push(finding('recovery-error-swallow', file, source, match.index, '恢复 Promise 不得用空 catch 回调静默吞掉错误。'))
  }
  return results
}

const runtimeImports = (source) => {
  const tokens = scannerTokens(source)
  const modules = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.kind !== SyntaxKind.StringLiteral) continue
    const previous = tokens[index - 1]
    const twoBack = tokens[index - 2]
    if (previous?.kind === SyntaxKind.OpenParenToken && twoBack?.kind === SyntaxKind.ImportKeyword) {
      modules.push(token.value)
      continue
    }
    if (previous?.kind !== SyntaxKind.FromKeyword && previous?.kind !== SyntaxKind.ImportKeyword) continue
    let statementStart = index - 1
    while (statementStart >= 0 && ![SyntaxKind.ImportKeyword, SyntaxKind.ExportKeyword, SyntaxKind.SemicolonToken, SyntaxKind.CloseBraceToken].includes(tokens[statementStart].kind)) statementStart -= 1
    if (tokens[statementStart]?.kind === SyntaxKind.SemicolonToken || tokens[statementStart]?.kind === SyntaxKind.CloseBraceToken) statementStart += 1
    const statement = source.slice(tokens[statementStart]?.pos ?? 0, token.end)
    if (/^\s*(?:import|export)\s+type\b/.test(statement)) continue
    const namedOnly = /^\s*import\s*\{([\s\S]*?)\}\s*from/.exec(statement)
    if (namedOnly && namedOnly[1].split(',').filter(Boolean).every((part) => /^\s*type\b/.test(part))) continue
    modules.push(token.value)
  }
  return modules
}

const resolveCoreImport = (file, specifier, files) => {
  let base = null
  if (specifier.startsWith('@/core/')) base = `${CORE_ROOT}${specifier.slice('@/core/'.length)}`
  else if (specifier === '@/core') base = `${CORE_ROOT}index`
  else if (specifier.startsWith('.')) base = normalize(join(dirname(file), specifier))
  if (!base || !base.startsWith(CORE_ROOT)) return null
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidates.find((candidate) => files.has(normalize(candidate))) ?? null
}

const coreCycleFindings = (files) => {
  const coreFiles = [...files.keys()].filter((file) => file.startsWith(CORE_ROOT) && isProductionSource(file))
  const graph = new Map(coreFiles.map((file) => [file, new Set()]))
  for (const file of coreFiles) {
    for (const specifier of runtimeImports(files.get(file))) {
      const target = resolveCoreImport(file, specifier, files)
      if (target) graph.get(file).add(target)
    }
  }

  let sequence = 0
  const stack = []
  const onStack = new Set()
  const indexes = new Map()
  const lowLinks = new Map()
  const components = []
  const visit = (file) => {
    indexes.set(file, sequence)
    lowLinks.set(file, sequence)
    sequence += 1
    stack.push(file)
    onStack.add(file)
    for (const target of graph.get(file)) {
      if (!indexes.has(target)) {
        visit(target)
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(target)))
      } else if (onStack.has(target)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(target)))
      }
    }
    if (lowLinks.get(file) !== indexes.get(file)) return
    const component = []
    while (stack.length) {
      const member = stack.pop()
      onStack.delete(member)
      component.push(member)
      if (member === file) break
    }
    if (component.length > 1 || graph.get(file)?.has(file)) components.push(component.sort())
  }
  for (const file of coreFiles) if (!indexes.has(file)) visit(file)

  return components.flatMap((component) => component.map((file) => ({
    rule: 'core-runtime-cycle',
    file,
    line: 1,
    message: `运行时循环：${component.join(' -> ')}`,
  })))
}

const permanentAllowlistFindings = (file, source) => {
  if (!file.startsWith('scripts/') || /(?:\.test\.mjs$|\/fixtures\/)/.test(file)) return []
  const results = []
  const declaration = /\b(?:const|let|var)\s+((?:[A-Za-z_$][\w$]*(?:ALLOWLIST|WHITELIST|EXCEPTIONS?)[A-Za-z0-9_$]*)|(?:LEGACY_[A-Za-z0-9_$]*IMPORTS))\s*=\s*(?:new\s+Set\s*\(\s*\[|\[)/gi
  for (const match of source.matchAll(declaration)) {
    const context = source.slice(match.index, Math.min(source.length, match.index + 800))
    if (!/src[\\/]/.test(context)) continue
    results.push(finding('permanent-boundary-allowlist', file, source, match.index, `禁止新增按文件边界白名单 ${match[1]}。`))
  }
  if (/boundar|architecture-contract/i.test(file)) {
    for (const match of source.matchAll(/['"]src[\\/]renderer[\\/]src[\\/][^'"]+\.[cm]?[jt]sx?['"]/g)) {
      results.push(finding('permanent-boundary-allowlist', file, source, match.index, '边界脚本不得硬编码单个源码文件路径。'))
    }
  }
  for (const match of source.matchAll(/\b(?:architecture-contract|module-boundary|boundary)-(?:ignore|allow)\b/gi)) {
    results.push(finding('permanent-boundary-allowlist', file, source, match.index, '禁止使用按文件边界忽略指令。'))
  }
  return results
}

// 原 workspace-root-command 规则已退役（见 scripts/architecture-debt-budget.json 的 retiredRules）：
// 它守护的 `interface WorkspaceState` 形态已不存在于 store/，命中面为 0 的规则等于永久绿灯。
const renderKeyFindings = (file, source) => {
  if (!/render-keys?\.[cm]?[jt]sx?$/.test(file) || !isProductionSource(file)) return []
  const results = []
  const patterns = [
    /\b(?:JSON\.stringify|structuredClone)\s*\(/g,
    /\b(?:Array\.from|Object\.(?:values|entries))\s*\([^\n)]*(?:\.pixels\b|pixelData\b|\b(?:session\.)?document\b)/g,
    /\.pixels\s*\.\s*(?:join|map|reduce|toString)\s*\(/g,
    /\.pixelData\s*\.\s*(?:join|map|reduce|toString)\s*\(/g,
    /\.\.\.\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.(?:pixels|pixelData)\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      results.push(finding('render-key-pixel-serialization', file, source, match.index, '渲染键不得展开、复制或序列化像素/整份文档。'))
    }
  }
  for (const match of source.matchAll(/\$\{([^}\n]*(?:\.pixels|\.pixelData)[^}\n]*)\}/g)) {
    if (/^\s*getRasterContentRevision\s*\([^)]*(?:\.pixels|\.pixelData)\s*\)\s*$/.test(match[1])) continue
    results.push(finding('render-key-pixel-serialization', file, source, match.index, '渲染键模板不得包含像素内容。'))
  }
  return results
}

export const analyzeArchitectureFiles = (inputFiles) => {
  const files = inputFiles instanceof Map
    ? new Map([...inputFiles].map(([file, source]) => [normalize(file), source]))
    : new Map(Object.entries(inputFiles).map(([file, source]) => [normalize(file), source]))
  const findings = []
  for (const [file, source] of files) {
    findings.push(...componentDomainWriteFindings(file, source))
    findings.push(...historySnapshotFindings(file, source))
    findings.push(...secondaryDecodeFindings(file, source))
    findings.push(...asyncPreparationFindings(file, source))
    findings.push(...recoverySwallowFindings(file, source))
    findings.push(...permanentAllowlistFindings(file, source))
    findings.push(...renderKeyFindings(file, source))
    if (file.startsWith(RENDERER_ROOT) && isProductionSource(file)) {
      for (const boundary of moduleBoundaryFindings(file, source)) {
        findings.push({ rule: 'module-boundary-debt', file, line: boundary.line, message: boundary.message })
      }
    }
  }
  findings.push(...coreCycleFindings(files))
  const counts = Object.fromEntries(Object.keys(ARCHITECTURE_RULES).map((rule) => [rule, 0]))
  for (const item of findings) counts[item.rule] += 1
  return { findings, counts }
}

const collectFiles = async (root, directory, extensions) => {
  const absolute = join(root, directory)
  const entries = await readdir(absolute, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(root, child, extensions))
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(normalize(child))
  }
  return files
}

export const readArchitectureSourceFiles = async (root = process.cwd()) => {
  const paths = [
    ...await collectFiles(root, RENDERER_ROOT, ['.ts', '.tsx', '.mts', '.cts']),
    ...await collectFiles(root, 'scripts', ['.mjs', '.js']),
  ]
  const files = new Map()
  for (const file of paths) files.set(file, await readFile(join(root, file), 'utf8'))
  return files
}

const previousBudgetAtHead = (root) => {
  try {
    const source = execFileSync('git', ['show', `HEAD:${ARCHITECTURE_BUDGET_FILE}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return parseArchitectureBudget(source)
  } catch {
    return null
  }
}

/** 规则必须仍能在真实源码里命中：命中面为 0 的护栏等于永久绿灯。 */
const anchorMatches = (files, rules) => {
  const production = [...files].filter(([file]) => file.startsWith(RENDERER_ROOT) && isProductionSource(file))
  const matches = {}
  for (const [ruleId, entry] of Object.entries(rules)) {
    if (typeof entry?.anchor !== 'string' || !entry.anchor.trim()) continue
    const pattern = new RegExp(entry.anchor)
    matches[ruleId] = production.some(([file, source]) => pattern.test(file) || pattern.test(source))
  }
  return matches
}

export const runArchitectureContract = async (root = process.cwd(), { report = false } = {}) => {
  const files = await readArchitectureSourceFiles(root)
  const analysis = analyzeArchitectureFiles(files)
  const budget = await readArchitectureBudget(root)
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const ruleCount = Object.keys(ARCHITECTURE_RULES).length
  const errors = [
    ...architectureBudgetErrors({
      budget,
      counts: analysis.counts,
      currentVersion: packageJson.version,
      knownRuleIds: Object.keys(ARCHITECTURE_RULES),
      previousBudget: previousBudgetAtHead(root),
    }),
    ...architectureAnchorErrors({ budget, anchorMatches: anchorMatches(files, budget.rules) }),
  ]

  if (report || errors.length > 0) {
    console.log('架构契约扫描：')
    for (const [rule, label] of Object.entries(ARCHITECTURE_RULES)) {
      const count = analysis.counts[rule]
      const target = budget.rules[rule]
      console.log(`- ${rule}: ${count}/${target?.remaining ?? '?'}，到期 ${target?.expiresAt ?? '?'}，${label}`)
      for (const item of analysis.findings.filter((entry) => entry.rule === rule).slice(0, 5)) {
        console.log(`  ${item.file}:${item.line} ${item.message}`)
      }
      if (count > 5) console.log(`  另有 ${count - 5} 项。`)
    }
  }

  if (errors.length > 0) {
    console.error('架构契约检查失败：')
    for (const error of errors) console.error(`- ${error}`)
    return { ...analysis, errors }
  }

  const debt = Object.values(analysis.counts).reduce((sum, count) => sum + count, 0)
  console.log(`架构契约检查通过：${ruleCount} 类规则，当前登记迁移债务 ${debt} 项；预算只能递减、不能延期，规则失效会被自检拦下。`)
  return { ...analysis, errors: [] }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runArchitectureContract(process.cwd(), { report: process.argv.includes('--report') })
  if (result.errors.length > 0) process.exitCode = 1
}
