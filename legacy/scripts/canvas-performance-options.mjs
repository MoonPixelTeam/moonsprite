export const STANDARD_CANVAS_PERFORMANCE_SIZES = [128, 512, 1024]
export const LARGE_CANVAS_PERFORMANCE_SIZES = [800, 2000, 2048, 4000, 4096]
export const CANVAS_PERFORMANCE_SIZES = [...new Set([
  ...STANDARD_CANVAS_PERFORMANCE_SIZES,
  ...LARGE_CANVAS_PERFORMANCE_SIZES,
])]
export const CANVAS_PERFORMANCE_SCENARIOS = ['pan', 'zoom', 'rotated-zoom', 'draw', 'brush-128-zoom2', 'shape', 'marquee', 'magic-wand', 'bucket-fill', 'gradient']
export const COMPLEX_CANVAS_PERFORMANCE_SCENARIOS = ['complex-draw', 'complex-brush-128-zoom2', 'complex-undo', 'complex-playback', 'complex-playback-pan']
export const LARGE_CANVAS_PERFORMANCE_SCENARIOS = ['large-pan', 'large-zoom', 'large-draw', 'large-shape', 'large-marquee', 'large-bucket-fill', 'large-selection-fill', 'large-selection-delete', 'large-layer-visibility', 'large-group-visibility', 'large-layer-opacity', 'large-layer-reorder', 'large-layer-style-move', 'large-layer-style-shadow-size', 'large-layer-style-inner-glow-size', 'large-gradient', 'large-detail-pan', 'large-detail-draw', 'large-detail-draw-timelapse']
const SUPPORTED_SCENARIOS = [...CANVAS_PERFORMANCE_SCENARIOS, ...COMPLEX_CANVAS_PERFORMANCE_SCENARIOS, ...LARGE_CANVAS_PERFORMANCE_SCENARIOS]
SUPPORTED_SCENARIOS.push(...['rotate', 'rotated-zoom', 'erase', 'selection-move', 'selection-scale', 'selection-rotate', 'undo', 'playback'].map(action => `large-${action}`))
const SUPPORTED_RUNTIMES = ['production', 'profile']

const readOption = (args, name) => {
  const inline = args.find((argument) => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const parseList = (value) => value?.split(',').map((item) => item.trim()).filter(Boolean)

export function parseCanvasPerformanceOptions(rawArgs) {
  const args = rawArgs.filter((argument) => argument !== '--')
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (/^--(?:preview|layers|frames|zoom|device-scale|viewport)=/.test(argument)) continue
    if (argument === '--full' || argument.startsWith('--size=') || argument.startsWith('--scenario=') || argument.startsWith('--repeat=') || argument.startsWith('--output-json=') || argument.startsWith('--runtime=')) continue
    if (argument === '--size' || argument === '--scenario' || argument === '--repeat' || argument === '--output-json' || argument === '--runtime') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${argument} 缺少参数值。`)
      index += 1
      continue
    }
    throw new Error(`未知的画布性能参数：${argument}`)
  }
  const full = args.includes('--full')
  const sizeValues = parseList(readOption(args, '--size'))
  const scenarioValues = parseList(readOption(args, '--scenario'))
  const repetitions = Number(readOption(args, '--repeat') ?? 1)
  const outputJson = readOption(args, '--output-json')
  const runtime = readOption(args, '--runtime') ?? 'production'
  const sizes = full || !sizeValues
    ? [...STANDARD_CANVAS_PERFORMANCE_SIZES]
    : sizeValues.map((value) => Number(value))
  const scenarios = full || !scenarioValues
    ? [...CANVAS_PERFORMANCE_SCENARIOS]
    : scenarioValues

  const invalidSizes = sizes.filter((size) => !CANVAS_PERFORMANCE_SIZES.includes(size))
  const invalidScenarios = scenarios.filter((scenario) => !SUPPORTED_SCENARIOS.includes(scenario))
  const scenarioFamilies = new Set(scenarios.map((scenario) => scenario.startsWith('complex-') ? 'complex' : scenario.startsWith('large-') ? 'large' : 'simple'))
  if (invalidSizes.length > 0) throw new Error(`不支持的画布尺寸：${invalidSizes.join(', ')}。可选值：${CANVAS_PERFORMANCE_SIZES.join(', ')}。`)
  if (invalidScenarios.length > 0) throw new Error(`不支持的画布场景：${invalidScenarios.join(', ')}。可选值：${SUPPORTED_SCENARIOS.join(', ')}。`)
  if (scenarioFamilies.size > 1) throw new Error('简单、复杂和大画布工程场景不能在同一进程中混合运行。')
  if (full && (sizeValues || scenarioValues)) throw new Error('`--full` 不能与 `--size` 或 `--scenario` 同时使用。')
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('`--repeat` 必须是 1 至 10 的整数。')
  if (!SUPPORTED_RUNTIMES.includes(runtime)) throw new Error(`不支持的画布运行模式：${runtime}。可选值：${SUPPORTED_RUNTIMES.join(', ')}。`)

  const workload = {}
  for (const [name, key] of [['zoom', 'zoom'], ['device-scale', 'deviceScale']]) {
    const raw = readOption(args, `--${name}`)
    if (raw === undefined) continue
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0 || value > (name === 'zoom' ? 64 : 4)) throw new Error(`Invalid ${name}`)
    workload[key] = value
  }
  const viewport = readOption(args, '--viewport')
  if (viewport !== undefined) {
    const match = /^(\d+)x(\d+)$/.exec(viewport)
    if (!match || match.slice(1).some(value => Number(value) < 400 || Number(value) > 4096)) throw new Error('Invalid viewport')
    workload.viewport = { width: Number(match[1]), height: Number(match[2]) }
  }
  const preview = readOption(args, '--preview')
  if (preview !== undefined) {
    if (!['on', 'off'].includes(preview)) throw new Error('preview must be on or off')
    workload.preview = preview
  }
  for (const name of ['layers', 'frames']) {
    const raw = readOption(args, `--${name}`)
    if (raw === undefined) continue
    const value = Number(raw)
    if (!Number.isInteger(value) || value < (name === 'layers' ? 2 : 1) || value > (name === 'layers' ? 200 : 24)) throw new Error(`Invalid ${name}`)
    if (scenarioFamilies.size !== 1 || !scenarioFamilies.has('large')) throw new Error('Custom layers/frames require large scenarios')
    workload[name] = value
  }
  return { full, sizes, scenarios, repetitions, outputJson, runtime, ...workload }
}
