import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { parseAuditArguments, resolvePerformanceAuditFiles } from './performance-audit-store.mjs'

test('性能审计参数显式区分全仓库模式', () => {
  assert.equal(parseAuditArguments(['--all', '--release', '--ci']).all, true)
  assert.deepEqual(parseAuditArguments(['--', 'src/renderer/src/core/selection.ts']).files, ['src/renderer/src/core/selection.ts'])
  assert.equal(parseAuditArguments(['--release']).all, false)
})

test('省略文件不会静默回退到工作区，--all 才触发发现', () => {
  assert.throws(
    () => resolvePerformanceAuditFiles({ files: [], all: false }, () => ['src/example.ts']),
    /--all/,
  )
  assert.deepEqual(
    resolvePerformanceAuditFiles({ files: [], all: true }, () => ['src/example.ts']),
    ['src/example.ts'],
  )
  assert.throws(
    () => resolvePerformanceAuditFiles({ files: ['src/example.ts'], all: true }, () => []),
    /不能与显式文件/,
  )
  assert.throws(
    () => resolvePerformanceAuditFiles({ files: [], all: true }, () => []),
    /未找到可审计/,
  )
})

test('性能审计把相对路径写法统一后再分类', () => {
  const absolute = `${process.cwd()}\\src\\renderer\\src\\components\\CanvasStage.tsx`
  assert.deepEqual(
    resolvePerformanceAuditFiles({ files: ['./src/renderer/src/components/CanvasStage.tsx'], all: false }, () => []),
    ['src/renderer/src/components/CanvasStage.tsx'],
  )
  assert.deepEqual(
    resolvePerformanceAuditFiles({ files: [absolute], all: false }, () => []),
    ['src/renderer/src/components/CanvasStage.tsx'],
  )
  assert.throws(
    () => resolvePerformanceAuditFiles({ files: ['../outside.ts'], all: false }, () => []),
    /范围无效.*必须位于仓库内/,
  )
})

test('性能审计入口无范围时在昂贵构建前安全失败', () => {
  const result = spawnSync(process.execPath, ['scripts/run-performance-audit.mjs'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /性能审计未运行[\s\S]*--all/)
})

test('无性能套件时在环境采集和工件写入前快速退出', () => {
  const result = spawnSync(process.execPath, [
    'scripts/run-performance-audit.mjs',
    'scripts/performance-analysis.mjs',
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /性能审计跳过：P0 范围没有自动性能套件/)
})
