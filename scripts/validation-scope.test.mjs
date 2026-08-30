import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyValidationScope,
  getRendererCodeFiles,
  getRustIntegrationTestTargets,
  isRendererCodeFile,
  normalizeValidationFile,
  normalizeValidationFiles,
} from './validation-scope.mjs'

test('文档修改不触发应用构建', () => {
  assert.deepEqual(
    classifyValidationScope(['docs/product/behavior.md']),
    { files: ['docs/product/behavior.md'], full: false, web: false, rust: false, thumbnail: false, desktop: false },
  )
})

test('渲染器、Rust 与缩略图修改分别触发对应范围', () => {
  assert.equal(classifyValidationScope(['src/renderer/src/App.tsx']).web, true)
  const rust = classifyValidationScope(['src-tauri/src/lib.rs'])
  assert.equal(rust.rust, true)
  assert.equal(rust.desktop, true)
  assert.equal(rust.thumbnail, false)
  const rustIntegration = classifyValidationScope(['src-tauri/tests/recovery.rs'])
  assert.equal(rustIntegration.rust, true)
  assert.equal(rustIntegration.desktop, true)
  const nestedRustIntegration = classifyValidationScope(['src-tauri/tests/recovery/cases.rs'])
  assert.equal(nestedRustIntegration.rust, true)
  assert.equal(nestedRustIntegration.desktop, true)
  const thumbnail = classifyValidationScope(['src-tauri/thumbnail-provider/src/lib.rs'])
  assert.equal(thumbnail.thumbnail, true)
  assert.equal(thumbnail.rust, false)
  const nestedThumbnailIntegration = classifyValidationScope(['src-tauri/thumbnail-provider/tests/provider/cases.rs'])
  assert.equal(nestedThumbnailIntegration.thumbnail, true)
  assert.equal(nestedThumbnailIntegration.rust, false)
})

test('Cargo integration tests resolve to their top-level targets, including nested modules', () => {
  assert.deepEqual(
    getRustIntegrationTestTargets([
      'src-tauri/tests/recovery.rs',
      'src-tauri/tests/recovery/cases.rs',
      'src-tauri/tests/recovery/helpers.rs',
      'src-tauri/tests/other.rs',
      'src-tauri/tests/README.md',
    ], 'src-tauri'),
    ['recovery', 'other'],
  )
  assert.deepEqual(
    getRustIntegrationTestTargets([
      'src-tauri/thumbnail-provider/tests/provider.rs',
      'src-tauri/thumbnail-provider/tests/provider/fixtures.rs',
    ], 'src-tauri/thumbnail-provider'),
    ['provider'],
  )
})

test('依赖、配置和 CI 变化使用保守的完整范围', () => {
  for (const file of ['package.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml']) {
    const scope = classifyValidationScope([file])
    assert.equal(scope.full, true)
    assert.equal(scope.web, true)
    assert.equal(scope.rust, true)
    assert.equal(scope.thumbnail, true)
  }
})

test('手动完整验证覆盖所有范围', () => {
  const scope = classifyValidationScope([], { forceFull: true })
  assert.deepEqual(
    scope,
    { files: [], full: true, web: true, rust: true, thumbnail: true, desktop: true },
  )
})

test('开发模式不让工程配置变化扩散到无关原生范围', () => {
  const scope = classifyValidationScope(['package.json'], { expandFull: false })
  assert.deepEqual(
    scope,
    { files: ['package.json'], full: true, web: true, rust: false, thumbnail: false, desktop: false },
  )
})

test('定向 Renderer 文件范围不包含样式、文档或 Rust 文件', () => {
  assert.equal(isRendererCodeFile('src/renderer/src/components/Toolbar.tsx'), true)
  assert.equal(isRendererCodeFile('src/shared/types.ts'), true)
  assert.equal(isRendererCodeFile('src/renderer/src/styles.css'), false)
  assert.equal(isRendererCodeFile('src-tauri/src/lib.rs'), false)
  assert.deepEqual(
    getRendererCodeFiles([
      'src/renderer/src/components/Toolbar.tsx',
      'src/renderer/src/components/Toolbar.tsx',
      'src/renderer/src/styles.css',
      'docs/product/behavior.md',
    ]),
    ['src/renderer/src/components/Toolbar.tsx'],
  )
})

test('验证入口把 ./ 和绝对路径统一成仓库相对路径', () => {
  assert.equal(normalizeValidationFile('./src/renderer/src/App.tsx', process.cwd()), 'src/renderer/src/App.tsx')
  const absolute = `${process.cwd()}\\src\\renderer\\src\\App.tsx`
  assert.equal(normalizeValidationFile(absolute, process.cwd()), 'src/renderer/src/App.tsx')
  assert.deepEqual(normalizeValidationFiles(['./docs/README.md', 'docs/README.md'], process.cwd()), ['docs/README.md'])
  assert.throws(() => normalizeValidationFile('../outside.ts', process.cwd()), /必须位于仓库内/)
})
