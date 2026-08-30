const normalize = (file) => file.replaceAll('\\', '/')

const sourceExtension = '[cm]?[jt]sx?'
const vitestPattern = new RegExp(`^src\\/.*\\.(?:test|spec|bench)\\.${sourceExtension}$`)
const nodeTestPattern = /^scripts\/.*\.(?:test|spec)\.(?:mjs|cjs|js)$/
const rustTestPattern = /^(?:src-tauri\/(?:tests|thumbnail-provider\/tests)\/.*|src-tauri\/(?:src|thumbnail-provider\/src)\/.*\.(?:test|spec))\.rs$/
const javascriptSourcePattern = new RegExp(`\\.${sourceExtension}$`)

const nonApplicationPattern = /^(?:docs\/|CHANGELOG(?:\.[^/]+)?$|.*\.(?:css|md|scss|txt)$)/
const quickRendererPattern = /^src\/renderer\/src\/(?:components\/|styles\.css$|locales\/|assets\/)/
const highRiskPathPatterns = [
  new RegExp(`^src\\/shared\\/.*\\.${sourceExtension}$`),
  new RegExp(`^src\\/renderer\\/src\\/components\\/(?:CanvasStage|canvas-(?:selection-renderer|move-selection|composite-cache)|selection-size-preview-events)\\.${sourceExtension}$`),
  /^src\/renderer\/src\/core\/(?:selection(?:-[\w-]+)?|(?:view|preview)-geometry(?:-[\w-]+)?|project-format(?:-[\w-]+)?|document(?:-[\w-]+)?|(?:history|storage|png|gif|psd|aseprite|bmp)|canvas-(?:input|render-plan|resize-preview))\.[cm]?[jt]sx?$/,
  /^src\/renderer\/src\/store\/(?:document-file-service|recovery-service|workspace-history)\.[cm]?[jt]sx?$/,
  /^src\/renderer\/src\/platform\/tauri-api\.[cm]?[jt]sx?$/,
  /^src\/renderer\/src\/workers\/(?:document-decode|project-encode)\.worker\.[cm]?[jt]sx?$/,
  /^src-tauri\/src\/(?:close_coordinator|platform_(?:recovery|storage|files|paths|diagnostics))\.rs$/,
]

const normalizeList = (files) => files.map(normalize).filter(Boolean)
const matchesHighRiskPath = (file) => highRiskPathPatterns.some((pattern) => pattern.test(file))

export const isJavaScriptTestFile = (file) => {
  const normalized = normalize(file)
  return vitestPattern.test(normalized) || nodeTestPattern.test(normalized)
}

export const isRustTestFile = (file) => rustTestPattern.test(normalize(file))

const isJavaScriptSourceFile = (file) => javascriptSourcePattern.test(file) && !isJavaScriptTestFile(file)

// D1 covers presentation work whose correctness is primarily user-visible.
// Keep domain and shared TypeScript on the stricter D2 path.
export const classifyDevTier = (requestedFiles, { highRisk = false } = {}) => {
  const files = normalizeList(requestedFiles)
  if (highRisk) return 'D3'
  if (files.length > 0 && files.every((file) => nonApplicationPattern.test(file))) return 'D0'
  if (files.some(matchesHighRiskPath)) return 'D3'
  if (files.length > 0 && files.every((file) => quickRendererPattern.test(file))) return 'D1'
  return 'D2'
}

export const isExplicitDevTestFile = (file) => {
  return isJavaScriptTestFile(file) || isRustTestFile(file)
}

export const evaluateDevValidationRequest = (requestedFiles, { highRisk = false, strict = false } = {}) => {
  const files = normalizeList(requestedFiles)
  const explicitTestFiles = files.filter(isExplicitDevTestFile)
  const explicitJavaScriptTestFiles = files.filter(isJavaScriptTestFile)
  const tier = classifyDevTier(files, { highRisk })
  const testOnly = files.length > 0 && files.every(isExplicitDevTestFile)
  const errors = []

  if (files.length === 0) {
    errors.push('开发检查必须显式传入本任务文件，不能自动扫描整个工作树。')
  }

  // Rust D3 paths run cargo check below, or the matching cargo test target
  // when an integration test is listed. Requiring a synthetic JavaScript test
  // for a Rust-only change blocks valid work and adds no coverage.
  // JavaScript/TypeScript D3 paths still need one explicit focused test,
  // including Vitest benchmark files.
  const requiresJavaScriptTest = (highRisk || tier === 'D3')
    && files.some(isJavaScriptSourceFile)
  if (requiresJavaScriptTest && explicitJavaScriptTestFiles.length === 0) {
    errors.push('D3 高风险开发检查必须显式传入至少一个定向测试文件。')
  }

  return {
    files,
    explicitTestFiles,
    explicitJavaScriptTestFiles,
    testOnly,
    errors,
    tier,
    runTypecheck: strict || (!testOnly && tier !== 'D0' && tier !== 'D1'),
  }
}

// CSS, docs, and other non-TypeScript files may accompany a renderer change.
// Ignore those files when deciding whether the fast web-only typecheck is safe.
export const isRendererOnlyTypecheckScope = (requestedFiles) => {
  const files = normalizeList(requestedFiles)
  const typecheckInputs = files.filter((file) => javascriptSourcePattern.test(file) || file.endsWith('.json'))
  return typecheckInputs.length > 0 && typecheckInputs.every((file) => file.startsWith('src/renderer/'))
}
