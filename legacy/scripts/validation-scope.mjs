import { isAbsolute, relative, resolve } from 'node:path'

const normalize = (file) => file.replaceAll('\\', '/')

/**
 * Convert CLI paths to repository-relative paths before any scope decision.
 * The validation rules operate on repository paths; accepting an absolute or
 * `./` path without normalizing it can otherwise make the script skip every
 * check while still reporting success.
 */
export const normalizeValidationFile = (file, repositoryRoot = process.cwd()) => {
  const value = String(file ?? '').trim()
  if (!value) throw new Error('验证文件路径不能为空。')
  const absolute = isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value)
  const normalizedRoot = resolve(repositoryRoot)
  const relativePath = normalize(relative(normalizedRoot, absolute))
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    throw new Error(`验证文件必须位于仓库内：${value}`)
  }
  return relativePath
}

export const normalizeValidationFiles = (files, repositoryRoot = process.cwd()) => (
  [...new Set(files.map((file) => normalizeValidationFile(file, repositoryRoot)))]
)

const FULL_VALIDATION_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json',
  '.github/workflows/ci.yml',
  'scripts/ci-scope.mjs',
  'scripts/run-validation.mjs',
  'scripts/validation-scope.mjs',
])

const startsWithAny = (file, roots) => roots.some((root) => file.startsWith(root))
const rendererCodePattern = /^src\/(?:renderer|shared)\/.*\.[cm]?[jt]sx?$/

export const isRendererCodeFile = (file) => rendererCodePattern.test(normalize(file))

export const getRendererCodeFiles = (files) => (
  [...new Set(files.map(normalize).filter(isRendererCodeFile))]
)

/**
 * Resolve Cargo integration-test targets from changed files. Cargo names an
 * integration target after the first path segment under `tests/`; nested
 * module files therefore need to map back to their top-level test target.
 */
export const getRustIntegrationTestTargets = (files, packageRoot) => {
  const marker = `${normalize(packageRoot).replace(/\/$/, '')}/tests/`
  return [...new Set(files.map(normalize).flatMap((file) => {
    if (!file.startsWith(marker) || !file.endsWith('.rs')) return []
    const firstSegment = file.slice(marker.length).split('/')[0]
    return firstSegment.endsWith('.rs') ? [firstSegment.slice(0, -3)] : [firstSegment]
  }))]
}

export function classifyValidationScope(files, { forceFull = false, expandFull = true } = {}) {
  const normalizedFiles = [...new Set(files.map(normalize).filter(Boolean))]
  const full = forceFull || normalizedFiles.some((file) => FULL_VALIDATION_FILES.has(file))
  const expand = full && expandFull
  const web = expand || normalizedFiles.some((file) => (
    startsWithAny(file, ['src/renderer/', 'src/shared/'])
    || /^(package\.json|pnpm-lock\.yaml|vite\.config\.ts|vitest\.config\.ts|tsconfig(\.node|\.web)?\.json)$/.test(file)
  ))
  const thumbnail = expand || normalizedFiles.some((file) => file.startsWith('src-tauri/thumbnail-provider/'))
  const rust = expand || normalizedFiles.some((file) => (
    startsWithAny(file, [
      'src-tauri/src/',
      'src-tauri/tests/',
      'src-tauri/capabilities/',
      'src-tauri/icons/',
      'src-tauri/resources/',
    ])
    || /^src-tauri\/(Cargo\.(toml|lock)|build\.rs|tauri\.conf\.json)$/.test(file)
  ))
  const desktop = expand || rust || normalizedFiles.some((file) => /scripts\/(desktop-regression|tauri-smoke|prepare-release)\.mjs$/.test(file))

  return { files: normalizedFiles, full, web, rust, thumbnail, desktop }
}
