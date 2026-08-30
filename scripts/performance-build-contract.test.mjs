import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PERFORMANCE_HARNESS_FILES, performanceSourceFingerprint } from './performance-runtime.mjs'

test('性能 Canvas 使用独立生产预览构建和应用内 Harness', async () => {
  const [canvas, vite, main, profiler, timelapseWorker, timelapse, projectFormat, brushes, packageSource] = await Promise.all([
    readFile('scripts/canvas-performance.mjs', 'utf8'),
    readFile('vite.config.ts', 'utf8'),
    readFile('src/renderer/src/main.tsx', 'utf8'),
    readFile('src/renderer/src/components/PerformanceProfiler.tsx', 'utf8'),
    readFile('src/renderer/src/workers/timelapse-encode.worker.ts', 'utf8'),
    readFile('src/renderer/src/core/timelapse.ts', 'utf8'),
    readFile('src/renderer/src/core/project-format.ts', 'utf8'),
    readFile('src/renderer/src/core/brushes.ts', 'utf8'),
    readFile('package.json', 'utf8'),
  ])
  const scripts = JSON.parse(packageSource).scripts

  assert.doesNotMatch(canvas, /import\(['"]\/src\//)
  assert.match(canvas, /'preview'/)
  assert.match(canvas, /performance-production/)
  assert.match(canvas, /performance-profile/)
  assert.match(vite, /react-dom\/profiling\.js/)
  assert.match(vite, /out\/\$\{mode\}/)
  assert.match(main, /__MOONSPRITE_PERFORMANCE_BUILD__/)
  assert.match(main, /import\('\.\/performance\/benchmark-harness'\)/)
  assert.match(profiler, /__MOONSPRITE_REACT_PROFILE__/)
  assert.match(timelapseWorker, /core\/png-encode/)
  assert.doesNotMatch(timelapseWorker, /core\/png['"]/)
  assert.match(timelapse, /from '\.\/png-encode'/)
  assert.doesNotMatch(timelapse, /from '\.\/png'/)
  assert.match(projectFormat, /from '\.\/png-encode'/)
  assert.doesNotMatch(projectFormat, /from '\.\/png'/)
  assert.match(brushes, /from '\.\/png-encode'/)
  assert.doesNotMatch(brushes, /from '\.\/png'/)
  assert.match(brushes, /await import\('\.\/png'\)/)
  assert.match(scripts['build:web:performance'], /performance-production/)
  assert.match(scripts['build:web:performance-profile'], /performance-profile/)
  assert.match(scripts['check:performance:release'], /run-performance-audit\.mjs --release/)
  assert.match(scripts['check:performance:receipt'], /check-performance-release\.mjs/)
  assert.equal(scripts['check:release-performance'], undefined)
  assert.equal(scripts['check:release:performance'], undefined)
  assert.equal(scripts['check:performance-release'], undefined)
})

test('性能源码指纹包含 benchmark、Harness 脚本和 Vitest 配置，但排除普通测试', () => {
  const harnessOnly = performanceSourceFingerprint(process.cwd(), [])
  const benchmark = performanceSourceFingerprint(process.cwd(), [
    'src/renderer/src/core/selection-performance.bench.ts',
  ])
  const harness = performanceSourceFingerprint(process.cwd(), ['scripts/canvas-performance.mjs'])
  const vitest = performanceSourceFingerprint(process.cwd(), ['vitest.config.ts'])
  const product = performanceSourceFingerprint(process.cwd(), ['src/renderer/src/core/selection.ts'])
  const regressionTest = performanceSourceFingerprint(process.cwd(), ['src/renderer/src/core/tools.test.ts'])

  assert.equal(benchmark.files, harnessOnly.files)
  assert.ok(PERFORMANCE_HARNESS_FILES.includes('src/renderer/src/core/selection-performance.bench.ts'))
  assert.equal(harness.files, harnessOnly.files)
  assert.equal(vitest.files, harnessOnly.files)
  assert.ok(product.files > harnessOnly.files)
  assert.equal(regressionTest.files, harnessOnly.files)
  assert.equal(regressionTest.value, harnessOnly.value)
})
