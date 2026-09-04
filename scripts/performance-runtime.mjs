import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { relative, resolve } from 'node:path'

export const normalizePath = (file) => file.replaceAll('\\', '/')
const splitLines = (value) => value.split(/\r?\n/).filter(Boolean)

export function git(args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' }).trim()
}

export function workingTreeFiles() {
  return [...new Set([
    ...splitLines(git(['diff', '--name-only', 'HEAD'])),
    ...splitLines(git(['ls-files', '--others', '--exclude-standard'])),
  ].map(normalizePath).filter((file) => !file.startsWith('resource/')))]
}

export function repositoryFiles() {
  return [...new Set([
    ...splitLines(git(['ls-files'])),
    ...splitLines(git(['ls-files', '--others', '--exclude-standard'])),
  ].map(normalizePath).filter((file) => !file.startsWith('resource/')))]
}

const testSourcePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const benchmarkSourcePattern = /\.bench\.[cm]?[jt]sx?$/
const performanceHarnessScriptPattern = /^scripts\/[^/]*(?:performance|benchmark)[^/]*\.(?:mjs|cjs|js)$/
const performanceConfigFiles = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'vitest.config.ts',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src-tauri/tauri.conf.json',
])

// Keep targeted audits small while making them sensitive to changes in the
// code that selects and runs measurements. The repository-wide mode still
// discovers every matching source file below, so this list only applies to
// an audit that supplies an explicit business-file scope.
export const PERFORMANCE_HARNESS_FILES = Object.freeze([
  ...performanceConfigFiles,
  'scripts/canvas-performance-options.mjs',
  'scripts/canvas-performance.mjs',
  'scripts/performance-acceptance.mjs',
  'scripts/performance-analysis.mjs',
  'scripts/performance-audit-store.mjs',
  'scripts/performance-executor.mjs',
  'scripts/performance-runtime.mjs',
  'scripts/performance-scope-rules.mjs',
  'scripts/run-performance-audit.mjs',
  'scripts/verify-performance-optimization.mjs',
  'scripts/accept-performance-audit.mjs',
  'scripts/check-performance-release.mjs',
  'src/renderer/src/core/selection-performance.bench.ts',
  'src/renderer/src/core/adjustments-performance.bench.ts',
  'src/renderer/src/core/document-performance.bench.ts',
  'src/renderer/src/core/project-format-performance.bench.ts',
  'src/renderer/src/performance/benchmark-harness.ts',
  'src/renderer/src/performance/benchmark-plan.ts',
  'src/renderer/src/test/setup.ts',
  'src/renderer/src/main.tsx',
  'src/renderer/src/components/PerformanceProfiler.tsx',
])

// A performance receipt must cover both the code under measurement and the
// harness that chooses, configures, and executes the measurement. Ordinary
// regression tests remain outside the fingerprint because changing a test
// should not invalidate an unrelated performance receipt.
const isPerformanceSource = (file) => {
  if (testSourcePattern.test(file)) return false
  if (performanceConfigFiles.has(file)) return true
  if (performanceHarnessScriptPattern.test(file)) return true
  if (benchmarkSourcePattern.test(file)) return file.startsWith('src/') || file.startsWith('src-tauri/')
  return /^(src\/|src-tauri\/(src|thumbnail-provider\/src)\/)/.test(file)
}

export function performanceSourceFingerprint(root = process.cwd(), selectedFiles = null) {
  // Targeted audits hash their declared business scope plus the fixed Harness
  // set above. The old implementation always listed and read every
  // performance source file, turning a small audit into a full-worktree I/O
  // pass. Release and --all callers omit selectedFiles and retain the
  // repository-wide fingerprint.
  const files = selectedFiles === null
    ? (() => {
        const tracked = splitLines(git(['ls-files']))
        const untracked = splitLines(git(['ls-files', '--others', '--exclude-standard']))
        return [...new Set([...tracked, ...untracked].map(normalizePath).filter(isPerformanceSource))].sort()
      })()
    : [...new Set([
        ...selectedFiles.map(normalizePath),
        ...PERFORMANCE_HARNESS_FILES,
      ].filter(isPerformanceSource))].sort()
  const hash = createHash('sha256')
  for (const file of files) {
    const absolute = resolve(root, file)
    if (!existsSync(absolute)) {
      hash.update(`${file}\0<missing>\0`)
      continue
    }
    hash.update(`${file}\0`)
    hash.update(readFileSync(absolute))
    hash.update('\0')
  }
  return {
    algorithm: 'sha256',
    value: hash.digest('hex'),
    files: files.length,
    scope: selectedFiles === null ? 'repository' : 'files',
  }
}

const browserCandidates = [
  process.env.MOONSPRITE_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) return 'unavailable'
  return (result.stdout || result.stderr || '').trim() || 'unavailable'
}

function windowsGpuFingerprint() {
  if (platform() !== 'win32') return 'unavailable'
  return commandOutput('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-CimInstance Win32_VideoController | Sort-Object Name | ForEach-Object { "$($_.Name)|$($_.DriverVersion)" }',
  ]).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).join('; ')
}

function windowsPowerPlan() {
  if (platform() !== 'win32') return 'unavailable'
  const output = commandOutput('powercfg.exe', ['/getactivescheme'])
  return output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? output
}

export function performanceEnvironment() {
  const browserPath = browserCandidates.find((candidate) => existsSync(candidate))
  let browser = 'unavailable'
  if (browserPath) {
    const version = platform() === 'win32'
      ? commandOutput('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Item -LiteralPath '${browserPath.replaceAll("'", "''")}').VersionInfo.ProductVersion`,
        ])
      : commandOutput(browserPath, ['--version'])
    browser = version === 'unavailable' ? browserPath : `${browserPath} ${version}`
  }
  return {
    platform: `${platform()} ${release()}`,
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    gpu: windowsGpuFingerprint(),
    powerPlan: windowsPowerPlan(),
    node: process.version,
    browser,
  }
}

export function currentReleaseLabel(root = process.cwd()) {
  const source = readFileSync(resolve(root, 'src/renderer/src/core/app-meta.ts'), 'utf8')
  const match = source.match(/APP_CHANNEL_LABEL\s*=\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error('无法读取 APP_CHANNEL_LABEL。')
  return match[1]
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, windowsHide: true, ...options })
  if (result.stdout && options.stdio !== 'inherit') process.stdout.write(result.stdout)
  if (result.stderr && options.stdio !== 'inherit') process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败，退出码 ${result.status ?? 1}。`)
  return result
}

export function runPnpm(args, options = {}) {
  if (process.env.npm_execpath) return run(process.execPath, [process.env.npm_execpath, ...args], options)
  // pnpm.cmd is a shell shim on Windows. Spawning it with shell=false can
  // raise EINVAL in the desktop environment, so mirror the validation entry
  // point and let Windows resolve the shim through its shell.
  return run(process.platform === 'win32' ? 'pnpm' : 'pnpm', args, {
    shell: process.platform === 'win32',
    ...options,
  })
}

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

export function collectBundleReport(root = process.cwd()) {
  const outputRoot = resolve(root, 'out/renderer')
  const chunks = walk(outputRoot).filter((file) => /\.(js|css)$/.test(file)).map((file) => {
    const bytes = readFileSync(file)
    return {
      file: normalizePath(relative(outputRoot, file)),
      bytes: statSync(file).size,
      gzipBytes: gzipSync(bytes).length,
    }
  }).sort((left, right) => right.gzipBytes - left.gzipBytes)
  return { schemaVersion: 1, suite: 'bundle', createdAt: new Date().toISOString(), chunks }
}
