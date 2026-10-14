import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import { expandLayerToRect, getLayerStorageOrigin, layerContentBounds, readLayerColor, setLayerStorageOrigin, writeLayerColor } from './document-model'

export type ConvolutionChannels = Record<'r' | 'g' | 'b' | 'a', boolean>
export interface ConvolutionPreset {
  id: string
  family: 'tone' | 'blur' | 'sharpen' | 'edges' | 'emboss' | 'drunk' | 'outline'
  size: number
  weights: number[]
  divisor: number
  bias: number
  channels: ConvolutionChannels
}
export interface ConvolutionOptions { presetId: string; channels: ConvolutionChannels; tiled: boolean }
const rgba: ConvolutionChannels = { r: true, g: true, b: true, a: true }
const rgb: ConvolutionChannels = { ...rgba, a: false }
const alpha: ConvolutionChannels = { r: false, g: false, b: false, a: true }
const kernel = (id: string, family: ConvolutionPreset['family'], size: number, weight: (x: number, y: number) => number, channels = rgba, divisor?: number, bias?: number): ConvolutionPreset => {
  const radius = size >> 1
  const weights = Array.from({ length: size * size }, (_, i) => weight(i % size - radius, Math.floor(i / size) - radius))
  const sum = weights.reduce((a, b) => a + b, 0)
  return { id, family, size, weights, channels, divisor: divisor ?? (Math.abs(sum) || 1), bias: bias ?? (sum > 0 ? 0 : sum === 0 ? 128 : 255) }
}

/** Common mathematical kernels, generated here independently of external preset files. */
export const CONVOLUTION_PRESETS: readonly ConvolutionPreset[] = [
  kernel('brightness', 'tone', 1, () => 1, rgb, 1, 8),
  kernel('darken', 'tone', 1, () => 1, rgb, 1, -8),
  kernel('negative', 'tone', 1, () => -1, rgb),
  kernel('blur-3x3', 'blur', 3, (x, y) => (2 - Math.abs(x)) * (2 - Math.abs(y))),
  ...[5, 7, 9, 17].map(size => kernel(`blur-${size}x${size}`, 'blur', size, (x, y) => size - Math.abs(x) - Math.abs(y))),
  ...[5, 9, 17].flatMap(size => [
    kernel(`blur-${size}x1`, 'blur', size, (_x, y) => y === 0 ? 1 : 0),
    kernel(`blur-1x${size}`, 'blur', size, (x) => x === 0 ? 1 : 0)
  ]),
  ...[3, 5, 7].map(size => kernel(`sharpen-${size}x${size}`, 'sharpen', size, (x, y) => x === 0 && y === 0 ? 2 * (size * size - 1) : -1, rgba, size * size - 1, 0)),
  kernel('edges-find', 'edges', 3, (x, y) => x === 0 && y === 0 ? 8 : -1, rgba, 1, 0),
  kernel('edges-horizontal', 'edges', 3, (_x, y) => y === 0 ? 2 : -1, rgb, 1, 0),
  kernel('edges-vertical', 'edges', 3, (x) => x === 0 ? 2 : -1, rgb, 1, 0),
  kernel('contour', 'edges', 3, (x, y) => x === 0 && y === 0 ? -8 : 1, rgb, 1, 255),
  kernel('emboss', 'emboss', 3, (x, y) => x + y, rgb, 1, 128),
  kernel('emboss-reverse', 'emboss', 3, (x, y) => -x - y, rgb, 1, 128),
  ...[3, 5, 7, 9, 17].flatMap(size => {
    const r = size >> 1
    return [
      kernel(`drunk-${size}x${size}_x`, 'drunk', size, (x, y) => (Math.abs(x) === r && Math.abs(y) === r) || (x === 0 && y === 0) ? 1 : 0),
      kernel(`drunk-${size}x${size}_+`, 'drunk', size, (x, y) => (Math.abs(x) === r && y === 0) || (Math.abs(y) === r && x === 0) || (x === 0 && y === 0) ? 1 : 0),
      kernel(`drunk-${size}x${size}_o`, 'drunk', size, (x, y) => Math.round(Math.hypot(x, y)) === r ? 1 : 0)
    ]
  }),
  kernel('outline-cross', 'outline', 3, (x, y) => x === 0 || y === 0 ? 255 : 0, alpha, 1, 0),
  kernel('outline-square', 'outline', 3, () => 255, alpha, 1, 0)
]

/** Computes into detached storage. Yields between chunks and never publishes partial pixels. */
export async function convolveLayer(document: SpriteDocument, source: RasterLayer, options: ConvolutionOptions, selection: SelectionMask | null, cancelled: () => boolean): Promise<RasterLayer | null> {
  const preset = CONVOLUTION_PRESETS.find(item => item.id === options.presetId)
  if (!preset) throw new Error(`Unknown convolution matrix: ${options.presetId}`)
  const radius = preset.size >> 1
  const taps = preset.weights.flatMap((weight, i) => weight ? [{ x: i % preset.size - radius, y: Math.floor(i / preset.size) - radius, weight }] : [])
  const bounds = layerContentBounds(document, source)
  const fillsEmpty = options.channels.a && preset.bias !== 0 && preset.divisor !== preset.weights.reduce((a, b) => a + b, 0)
  if (!bounds && !fillsEmpty) return null
  const crossesEdge = bounds && (bounds.x < radius || bounds.y < radius || bounds.x + bounds.width + radius > document.width || bounds.y + bounds.height + radius > document.height)
  const full = fillsEmpty || (options.tiled && crossesEdge)
  const left = Math.max(0, selection?.x ?? 0, full ? 0 : bounds!.x - radius)
  const top = Math.max(0, selection?.y ?? 0, full ? 0 : bounds!.y - radius)
  const right = Math.min(document.width, selection ? selection.x + selection.width : document.width, full ? document.width : bounds!.x + bounds!.width + radius)
  const bottom = Math.min(document.height, selection ? selection.y + selection.height : document.height, full ? document.height : bounds!.y + bounds!.height + radius)
  if (right <= left || bottom <= top || !Object.values(options.channels).some(Boolean)) return null
  let lastYield = performance.now()
  const yieldIfNeeded = async (): Promise<void> => {
    if (performance.now() - lastYield < 8) return
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    lastYield = performance.now()
  }
  const input = source.format === 'rgba' ? source.pixels : new Uint8ClampedArray(source.width * source.height * 4)
  if (source.format !== 'rgba') {
    for (let i = 0; i < source.width * source.height; i++) {
      if (i % 1024 === 0) { await yieldIfNeeded(); if (cancelled()) return null }
      const color = readLayerColor(document, source, i)
      input.set([color.r, color.g, color.b, color.a], i * 4)
    }
  }
  const output = { ...source, pixels: source.format === 'rgba' ? new Uint8ClampedArray(source.pixels) : new Uint32Array(source.pixels) } as RasterLayer
  setLayerStorageOrigin(output, getLayerStorageOrigin(source))
  if (!expandLayerToRect(output, left, top, right, bottom)) throw new Error('Unable to allocate convolution result')
  const coordinate = (value: number, length: number): number => options.tiled ? ((value % length) + length) % length : Math.max(0, Math.min(length - 1, value))
  const indexAt = (x: number, y: number): number => {
    const lx = x - source.offsetX, ly = y - source.offsetY
    return lx < 0 || ly < 0 || lx >= source.width || ly >= source.height ? -1 : (ly * source.width + lx) * 4
  }
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if ((x - left) % 128 === 0) { await yieldIfNeeded(); if (cancelled()) return null }
      if (selection?.mask && !selection.mask[(y - selection.y) * selection.width + x - selection.x]) continue
      let r = 0, g = 0, b = 0, a = 0, divisor = preset.divisor
      for (const tap of taps) {
        const index = indexAt(coordinate(x + tap.x, document.width), coordinate(y + tap.y, document.height))
        if (index < 0 || input[index + 3] === 0) { divisor -= tap.weight; continue }
        r += input[index] * tap.weight
        g += input[index + 1] * tap.weight
        b += input[index + 2] * tap.weight
        a += input[index + 3] * tap.weight
      }
      if (!divisor) continue
      const original = indexAt(x, y)
      const channel = (enabled: boolean, sum: number, component: number, div: number): number => enabled ? Math.max(0, Math.min(255, Math.trunc(sum / div) + preset.bias)) : original < 0 ? 0 : input[original + component]
      writeLayerColor(document, output, (y - output.offsetY) * output.width + x - output.offsetX, {
        r: channel(options.channels.r, r, 0, divisor), g: channel(options.channels.g, g, 1, divisor),
        b: channel(options.channels.b, b, 2, divisor), a: channel(options.channels.a, a, 3, preset.divisor)
      })
    }
  }
  return cancelled() ? null : output
}
