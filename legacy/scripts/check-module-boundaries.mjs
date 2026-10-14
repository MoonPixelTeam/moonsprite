import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScanner, SyntaxKind } from 'typescript/unstable/ast'
import { readArchitectureBudget } from './architecture-budget.mjs'
import { readFileSync } from 'node:fs'

const ROOT = 'src/renderer/src'
const normalize = (file) => file.replaceAll('\\', '/')
const moduleSizeBudget = JSON.parse(readFileSync(new URL('./module-size-budget.json', import.meta.url), 'utf8'))

const importedModules = (source) => {
  const scanner = createScanner(true, undefined, source)
  const modules = []
  let previous
  let twoBack
  let previousEnd = -1
  while (true) {
    const kind = scanner.scan()
    if (kind === SyntaxKind.EndOfFile) break
    const end = scanner.getTokenEnd()
    if (end <= previousEnd) break
    previousEnd = end
    const token = { kind, value: scanner.getTokenValue() }
    if (kind === SyntaxKind.StringLiteral) {
      if (previous?.kind === SyntaxKind.FromKeyword || previous?.kind === SyntaxKind.ImportKeyword) {
        modules.push({ specifier: token.value, pos: scanner.getTokenStart() })
      } else if (previous?.kind === SyntaxKind.OpenParenToken && twoBack?.kind === SyntaxKind.ImportKeyword) {
        modules.push({ specifier: token.value, pos: scanner.getTokenStart() })
      }
    }
    twoBack = previous
    previous = token
  }
  return modules
}

const pointsTo = (specifier, area) => (
  specifier.startsWith(`@/${area}/`)
  || specifier === `@/${area}`
  || specifier.includes(`/${area}/`)
  || specifier.endsWith(`/${area}`)
)

export const moduleBoundaryFindings = (file, source) => {
  const normalizedFile = normalize(file)
  const findings = []
  const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalizedFile)
  const inPlatform = normalizedFile.startsWith(`${ROOT}/platform/`)
  const inCore = normalizedFile.startsWith(`${ROOT}/core/`)
  const inStore = normalizedFile.startsWith(`${ROOT}/store/`)
  const budget = moduleSizeBudget[normalizedFile]
  const domainBudget = /\/store\/workspace-commands-layer-[\w-]+\.ts$/.test(normalizedFile) ? 850
    : /^src\/shared\/types-[\w-]+\.ts$/.test(normalizedFile) ? 200 : undefined
  if (!isTest && domainBudget !== undefined && source.trimEnd().split(/\r?\n/).length > domainBudget) {
    findings.push({file: normalizedFile, line: 1, message: `领域模块超过职责规模上限 ${domainBudget} 行；请审查状态和流程所有权。`})
  }
  if (budget !== undefined) {
    const lines = source.trimEnd().split(/\r?\n/).length
    if (lines > budget) findings.push({ file: normalizedFile, line: 1, message: `模块规模超过重构后的上限：${lines} > ${budget}；请按职责拆分，不要放宽预算。` })
  }

  for (const imported of importedModules(source)) {
    const { specifier } = imported
    const add = (message) => findings.push({
      file: normalizedFile,
      line: source.slice(0, imported.pos).split(/\r?\n/).length,
      message,
    })
    const responsibilityFamily = normalizedFile.match(/\/(canvas-input|document-composite|project-format|tools-selection-transform|canvas-composite-cache)-[\w-]+\.ts$/)?.[1]
    if (!isTest && responsibilityFamily && specifier.endsWith(`/${responsibilityFamily}`)) {
      add('职责子模块不得反向引用自己的公开聚合入口；直接依赖契约或实际实现模块。')
    }
    if (/\/components\/canvas-render-(?!frame\.ts$)[\w-]+\.ts$/.test(normalizedFile)
      && specifier.endsWith('/canvas-render-frame')) {
      add('渲染通道必须声明自己的输入，不得反向依赖总调度器或整份 CanvasRenderContext。')
    }
    if (!isTest && /(?:@shared\/types|\/shared\/types|^\.\/types)$/.test(specifier)) {
      add('生产模块必须直接引用所属领域的类型契约，禁止重新聚合到 shared/types。')
    }
    if (specifier.endsWith('/workspace-command-support') || specifier === './workspace-command-support') {
      add('禁止重建跨领域命令辅助中心；直接引用领域所有者。')
    }
    if (/\/core\/shortcuts\.ts$/.test(normalizedFile) && pointsTo(specifier, 'locales') && !specifier.endsWith('/contracts')) {
      add('快捷键匹配核心不得加载展示标签或语言目录。')
    }
    if (specifier.startsWith('@tauri-apps/') && !inPlatform) {
      add(`Tauri API 只能由 platform/ 访问（${specifier}）`)
    }
    if (isTest) continue
    if (/\/store\/workspace-(?:commands-|command-support|mutation|recording)/.test(normalizedFile)
      && /(?:^|\/)workspace$/.test(specifier)) {
      add(`业务模块不得反向依赖根 Store（${specifier}）`)
    }
    if (/\/core\/(?:document-(?:model|composite(?:-[\w-]+)?)|tools-[\w-]+)\.ts$/.test(normalizedFile)
      && /(?:^|\/)(?:document|tools)$/.test(specifier)) {
      add(`核心实现不得反向依赖兼容入口（${specifier}）`)
    }
    if (/\/core\/document-model\.ts$/.test(normalizedFile) && /(?:^|\/)document-composite(?:-[\w-]+)?$/.test(specifier)) {
      add(`文档模型不得依赖合成器（${specifier}）`)
    }
    if (/\/core\/tools-pixel-edit\.ts$/.test(normalizedFile) && /(?:^|\/)(?:document-composite(?:-[\w-]+)?|tools-(?!pixel-edit)[\w-]+)$/.test(specifier)) {
      add(`像素编辑内核不得依赖合成器或工具算法（${specifier}）`)
    }
    if (/\/components\/canvas-render-[\w-]+\.ts$/.test(normalizedFile) && /(?:^|\/)workspace$/.test(specifier)) {
      add(`画布渲染器必须通过显式参数获取状态（${specifier}）`)
    }
    if (inCore && (/^react(?:-dom)?(?:\/|$)/.test(specifier) || pointsTo(specifier, 'components') || pointsTo(specifier, 'platform'))) {
      add(`core/ 不得依赖 React、components/ 或 platform/（${specifier}）`)
    }
    if (inCore && pointsTo(specifier, 'store')) {
      add(`core/ 不得依赖 store/（${specifier}）`)
    }
    if (inStore && pointsTo(specifier, 'components')) {
      add(`store/ 不得依赖 components/（${specifier}）`)
    }
  }
  return findings
}

export const moduleBoundaryErrors = (file, source) => moduleBoundaryFindings(file, source)
  .map((finding) => `${finding.file}: ${finding.message}`)

export const moduleBoundaryFindingsForFiles = (files) => (
  files.flatMap(({ file, source }) => moduleBoundaryFindings(normalize(file), source))
)

const sourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path)
  }
  return files
}

const focusedFiles = () => {
  const marker = process.argv.indexOf('--files')
  if (marker < 0) return null
  const files = process.argv.slice(marker + 1).filter(Boolean).map(normalize)
  if (files.length === 0) {
    console.error('模块边界定向检查失败：--files 后必须提供至少一个文件。')
    process.exitCode = 1
    return []
  }
  return files
}

const runFocused = async (files) => {
  const sources = []
  const missing = []
  for (const file of files) {
    try {
      sources.push({ file, source: await readFile(join(process.cwd(), file), 'utf8') })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing.push(file)
        continue
      }
      throw error
    }
  }
  if (missing.length > 0) {
    console.error('模块边界定向检查失败：以下文件不存在：')
    for (const file of missing) console.error(`- ${file}`)
    process.exitCode = 1
    return
  }
  const findings = moduleBoundaryFindingsForFiles(sources)

  if (findings.length > 0) {
    console.error('模块边界定向检查失败：')
    for (const item of findings) console.error(`- ${item.file}:${item.line} ${item.message}`)
    process.exitCode = 1
    return
  }

  console.log(`模块边界定向检查通过：${files.length} 个变更文件。`)
}

const run = async () => {
  const focused = focusedFiles()
  if (focused !== null) {
    if (focused.length > 0) await runFocused(focused)
    return
  }

  const findings = []
  for (const path of await sourceFiles(ROOT)) {
    const file = normalize(relative(process.cwd(), path))
    findings.push(...moduleBoundaryFindings(file, await readFile(path, 'utf8')))
  }
  const budget = await readArchitectureBudget()
  const remaining = budget.rules['module-boundary-debt']?.remaining
  if (!Number.isInteger(remaining)) {
    console.error('模块边界检查失败：架构债务预算缺少 module-boundary-debt。')
    process.exitCode = 1
    return
  }
  if (findings.length !== remaining) {
    console.error('模块边界检查失败：')
    for (const item of findings) console.error(`- ${item.file}:${item.line} ${item.message}`)
    if (findings.length > remaining) console.error(`- 新增了模块边界债务：实际 ${findings.length}，预算 ${remaining}。`)
    else console.error(`- 模块边界债务已降至 ${findings.length}，请同步把预算从 ${remaining} 下调。`)
    process.exitCode = 1
    return
  }
  console.log(`模块边界检查通过：当前 ${findings.length} 项到期迁移债务，未使用按文件白名单。`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await run()
