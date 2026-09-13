import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCanvasPerformanceOptions } from './canvas-performance-options.mjs'

test('画布性能参数默认运行完整场景', () => {
  assert.deepEqual(parseCanvasPerformanceOptions([]), {
    full: false,
    sizes: [128, 512, 1024],
    scenarios: ['pan', 'zoom', 'rotated-zoom', 'draw', 'brush-128-zoom2', 'shape', 'marquee', 'magic-wand', 'bucket-fill', 'gradient'],
    repetitions: 1,
    outputJson: undefined,
    runtime: 'production',
  })
})

test('画布性能参数支持单尺寸和多场景筛选', () => {
  assert.deepEqual(parseCanvasPerformanceOptions(['--', '--size=512', '--scenario', 'pan,zoom']), {
    full: false,
    sizes: [512],
    scenarios: ['pan', 'zoom'],
    repetitions: 1,
    outputJson: undefined,
    runtime: 'production',
  })
})

test('画布性能参数拒绝未知尺寸和场景', () => {
  assert.throws(() => parseCanvasPerformanceOptions(['--size', '256']), /不支持的画布尺寸/)
  assert.throws(() => parseCanvasPerformanceOptions(['--scenario', 'selection']), /不支持的画布场景/)
  assert.throws(() => parseCanvasPerformanceOptions(['--scenaro', 'zoom']), /未知的画布性能参数/)
})

test('画布性能参数支持独立运行复杂工程场景', () => {
  assert.deepEqual(parseCanvasPerformanceOptions(['--size=1024', '--scenario=complex-draw,complex-undo,complex-playback', '--repeat=3', '--output-json=artifacts/result.json']), {
    full: false,
    sizes: [1024],
    scenarios: ['complex-draw', 'complex-undo', 'complex-playback'],
    repetitions: 3,
    outputJson: 'artifacts/result.json',
    runtime: 'production',
  })
  assert.throws(() => parseCanvasPerformanceOptions(['--scenario=draw,complex-draw']), /不能在同一进程中混合/)
  assert.throws(() => parseCanvasPerformanceOptions(['--repeat=0']), /1 至 10/)
})

test('大画布场景支持 800 至 4000 并可选择 Profiler 运行模式', () => {
  assert.deepEqual(parseCanvasPerformanceOptions(['--size=800,2048,4000', '--scenario=large-pan,large-draw,large-selection-fill,large-selection-delete,large-layer-visibility,large-group-visibility,large-layer-opacity,large-layer-reorder,large-layer-style-move,large-layer-style-shadow-size,large-layer-style-inner-glow-size,large-gradient', '--runtime=profile']), {
    full: false,
    sizes: [800, 2048, 4000],
    scenarios: ['large-pan', 'large-draw', 'large-selection-fill', 'large-selection-delete', 'large-layer-visibility', 'large-group-visibility', 'large-layer-opacity', 'large-layer-reorder', 'large-layer-style-move', 'large-layer-style-shadow-size', 'large-layer-style-inner-glow-size', 'large-gradient'],
    repetitions: 1,
    outputJson: undefined,
    runtime: 'profile',
  })
  assert.throws(() => parseCanvasPerformanceOptions(['--scenario=large-pan,draw']), /不能在同一进程中混合/)
  assert.throws(() => parseCanvasPerformanceOptions(['--runtime=unknown']), /不支持的画布运行模式/)
})
