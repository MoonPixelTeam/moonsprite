import test from 'node:test'
import assert from 'node:assert/strict'
import { changelogArchivePaths, isSoftwareChange, validateChangelogUpdate } from './check-changelog-update.mjs'

const changelog = '# 变更记录\n\n## 未发布\n\n- 当前变化\n\n## 版本索引\n'

test('源码、平台和构建文件属于更新日志门禁范围', () => {
  assert.equal(isSoftwareChange('src/renderer/App.tsx'), true)
  assert.equal(isSoftwareChange('src-tauri/src/lib.rs'), true)
  assert.equal(isSoftwareChange('.github/workflows/ci.yml'), true)
  assert.equal(isSoftwareChange('docs/README.md'), false)
  assert.equal(isSoftwareChange('resource/cursor.aseprite'), false)
})

test('软件变化未同步更新日志时拒绝通过', () => {
  const errors = validateChangelogUpdate(['src/renderer/App.tsx'], changelog)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /没有同步更新 CHANGELOG/)
})

test('软件变化与更新日志同时修改时允许通过', () => {
  assert.deepEqual(validateChangelogUpdate(['src/renderer/App.tsx', 'CHANGELOG.md'], changelog), [])
})

test('更新日志必须保留未发布区', () => {
  const errors = validateChangelogUpdate(['CHANGELOG.md'], '# 变更记录\n\n## 版本索引\n')
  assert.deepEqual(errors, ['CHANGELOG.md 必须保留“## 未发布”区。'])
})

test('更新日志必须保留版本索引且限制热区大小', () => {
  assert.deepEqual(
    validateChangelogUpdate(['CHANGELOG.md'], '# 变更记录\n\n## 未发布\n'),
    ['CHANGELOG.md 必须保留“## 版本索引”区。'],
  )
  assert.match(validateChangelogUpdate(['CHANGELOG.md'], `${changelog}${'a'.repeat(65536)}`)[0], /超过 64 KiB/)
})

test('只提取按版本归档链接', () => {
  assert.deepEqual(
    changelogArchivePaths('[DEV.2](docs/changelog/DEV.2.md) [规则](docs/release/changelog-policy.md)'),
    ['docs/changelog/DEV.2.md'],
  )
})
