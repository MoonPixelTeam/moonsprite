import { existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { evaluateDevValidationRequest, isRendererOnlyTypecheckScope } from './dev-validation-policy.mjs'
import {
  classifyValidationScope,
  getRendererCodeFiles,
  getRustIntegrationTestTargets,
  normalizeValidationFiles,
} from './validation-scope.mjs'

const mode = process.argv[2]
if (!['dev', 'release'].includes(mode)) {
  console.error('用法：node scripts/run-validation.mjs <dev|release> [--desktop] [--strict] [--risk=high] [-- <文件...>]')
  process.exit(1)
}

const git = (gitArgs) => execFileSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { encoding: 'utf8' }).trim()
const repositoryRoot = resolve(git(['rev-parse', '--show-toplevel']))
const args = process.argv.slice(3).filter((arg) => arg && arg !== '--')
const options = new Set(args.filter((arg) => arg.startsWith('--')))
const rawRequestedFiles = args.filter((arg) => !arg.startsWith('--'))
let requestedFiles
try {
  requestedFiles = normalizeValidationFiles(rawRequestedFiles, repositoryRoot)
} catch (error) {
  console.error(`验证范围无效：${error.message}`)
  process.exit(1)
}
const splitLines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : []
const normalize = (file) => file.replaceAll('\\', '/')

const workingTreeFiles = () => [...new Set([
  ...splitLines(git(['diff', '--name-only', 'HEAD'])),
  ...splitLines(git(['ls-files', '--others', '--exclude-standard'])),
].filter((file) => !normalize(file).startsWith('resource/')))]

const highRisk = options.has('--risk=high')
const strict = options.has('--strict')
const invalidRiskOptions = [...options].filter((option) => option.startsWith('--risk=') && option !== '--risk=high')
if (invalidRiskOptions.length > 0) {
  console.error(`不支持的风险参数：${invalidRiskOptions.join(', ')}。当前仅支持 --risk=high。`)
  process.exit(1)
}

const devPolicy = mode === 'dev'
  ? evaluateDevValidationRequest(requestedFiles, { highRisk, strict })
  : null
if (devPolicy?.errors.length) {
  for (const error of devPolicy.errors) console.error(error)
  console.error('示例：pnpm check:dev -- src/renderer/src/components/Toolbar.tsx')
  console.error('严格类型检查：pnpm check:dev -- --strict src/renderer/src/components/Toolbar.tsx')
  console.error('高风险示例：pnpm check:dev -- --risk=high src/renderer/src/core/selection.ts src/renderer/src/core/selection.test.ts')
  process.exit(1)
}

const files = (mode === 'dev'
  ? devPolicy.files
  : (requestedFiles.length > 0 ? requestedFiles : workingTreeFiles()).map(normalize))
const scope = classifyValidationScope(files, {
  forceFull: mode === 'release',
  expandFull: mode === 'release',
})
const run = (command, commandArgs, runOptions = {}) => {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`)
  const startedAt = performance.now()
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false, ...runOptions })
  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2)
  console.log(`耗时：${elapsed}s`)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const runPnpm = (commandArgs) => {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...commandArgs])
    return
  }
  run('pnpm', commandArgs, { shell: process.platform === 'win32' })
}

const webCodeFiles = scope.files.filter((file) => /^(src\/(renderer|shared)\/.*|vite\.config\.ts|vitest\.config\.ts|tsconfig.*\.json|package\.json|pnpm-lock\.yaml)$/.test(file) && /\.(ts|tsx|json|yaml)$/.test(file))
const rendererOnlyTypecheck = mode === 'dev'
  && scope.web
  && isRendererOnlyTypecheckScope(scope.files)
const explicitVitestFiles = scope.files.filter((file) => /^src\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
const explicitVitestBenchmarkFiles = scope.files.filter((file) => /^src\/.*\.bench\.[cm]?[jt]sx?$/.test(file))
const nodeTestFiles = scope.files.filter((file) => /^scripts\/.*\.(?:test|spec)\.(?:mjs|cjs|js)$/.test(file))
const nodeScriptFiles = scope.files
  .filter((file) => /^scripts\/.*\.(?:mjs|cjs|js)$/.test(file))
  .filter((file) => !/\.(?:test|spec)\.(?:mjs|cjs|js)$/.test(file))
  .filter((file) => existsSync(file))
const versionFilesChanged = scope.files.some((file) => new Set([
  'package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
  'src/renderer/src/core/app-meta.ts',
  'src/renderer/src/components/LatestReleaseDialog.tsx',
]).has(file))
const rendererCodeFiles = getRendererCodeFiles(scope.files).filter((file) => existsSync(file))
const rustIntegrationTests = getRustIntegrationTestTargets(scope.files, 'src-tauri')
const thumbnailIntegrationTests = getRustIntegrationTestTargets(scope.files, 'src-tauri/thumbnail-provider')

console.log(`验证模式：${mode === 'dev' ? '日常开发' : '发布准备'}`)
if (mode === 'dev') {
  const riskLabel = highRisk || devPolicy.tier === 'D3' ? '高风险（要求定向测试）' : '普通'
  console.log(`风险：${riskLabel}`)
  const typecheckLabel = !scope.web || !devPolicy.runTypecheck ? '否' : rendererOnlyTypecheck ? '仅 web 项目' : '完整项目'
  console.log(`开发档位：${devPolicy.tier}，类型检查：${typecheckLabel}`)
}
console.log(`范围：web=${scope.web}, rust=${scope.rust}, thumbnail=${scope.thumbnail}, desktop=${scope.desktop}`)

if (mode === 'release') {
  runPnpm(['check:performance:receipt'])
  // check:maintenance runs architecture-contract, including the full production boundary scan.
  runPnpm(['check:maintenance'])
  run(process.execPath, ['scripts/check-version-contract.mjs', '--release'])
  run(process.execPath, ['scripts/check-changelog-update.mjs'])
} else if (rendererCodeFiles.length > 0) {
  run(process.execPath, ['scripts/check-module-boundaries.mjs', '--files', ...rendererCodeFiles])
}

if (mode === 'dev' && nodeTestFiles.length > 0) {
  run(process.execPath, ['--test', ...nodeTestFiles])
}
if (mode === 'dev' && nodeScriptFiles.length > 0) {
  for (const file of nodeScriptFiles) run(process.execPath, ['--check', file])
}
if (mode === 'dev' && versionFilesChanged) runPnpm(['check:version'])

if (scope.web) {
  if (mode === 'release' || (webCodeFiles.length > 0 && devPolicy?.runTypecheck)) {
    if (rendererOnlyTypecheck) {
      runPnpm(['exec', 'tsc', '--noEmit', '-p', 'tsconfig.web.json'])
    } else {
      runPnpm(['typecheck'])
    }
  }
  if (mode === 'release') {
    runPnpm(['test'])
    runPnpm(['build:web'])
  } else if (explicitVitestFiles.length > 0) {
    runPnpm(['exec', 'vitest', 'run', ...explicitVitestFiles])
  }
  if (mode === 'dev' && explicitVitestBenchmarkFiles.length > 0) {
    runPnpm(['exec', 'vitest', 'bench', ...explicitVitestBenchmarkFiles, '--run'])
  }
}

if (scope.rust) {
  if (mode === 'release') run('cargo', ['fmt', '--check', '--manifest-path', 'src-tauri/Cargo.toml'])
  if (mode === 'dev' && rustIntegrationTests.length > 0) {
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', ...rustIntegrationTests.flatMap((name) => ['--test', name])])
  } else {
    run('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml'])
  }
}

if (scope.thumbnail) {
  if (mode === 'release') run('cargo', ['fmt', '--check', '--manifest-path', 'src-tauri/thumbnail-provider/Cargo.toml'])
  if (mode === 'dev' && thumbnailIntegrationTests.length > 0) {
    run('cargo', ['test', '--manifest-path', 'src-tauri/thumbnail-provider/Cargo.toml', ...thumbnailIntegrationTests.flatMap((name) => ['--test', name])])
  } else {
    const thumbnailCommand = mode === 'release' ? 'build' : 'check'
    run('cargo', [thumbnailCommand, '--manifest-path', 'src-tauri/thumbnail-provider/Cargo.toml', ...(mode === 'release' ? ['--release'] : [])])
  }
}

if (options.has('--desktop')) {
  if (mode !== 'release') {
    console.error('--desktop 只能用于发布检查。')
    process.exit(1)
  }
  runPnpm(['exec', 'tauri', 'build', '--no-bundle'])
  runPnpm(['test:tauri'])
}

if (mode === 'dev' && !scope.web && !scope.rust && !scope.thumbnail) {
  console.log('\n本次仅涉及文档或维护文件，无需应用验证。')
}
console.log('\n验证通过。')
